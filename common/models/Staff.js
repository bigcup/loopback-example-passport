var _ = require("underscore");
var ActiveDirectory = require('activedirectory');
var debug = require('debug')('loopback:user');
var request = require("request");
var soap = require("soap");
var async = require("async");

module.exports = function(model) {

    model.on("attached", function(){
        console.log('models', _.keys(model.app.models))
        model.app.models.Role.hasMany(model, {as: 'staffs', foreignKey: 'roleId', keyThrough: 'principalId', through: model.app.models.RoleMapping});
        model.app.models.RoleMapping.belongsTo(model, {as: 'staff', foreignKey: 'principalId'});
    });


    model.GetRoles = function (id, req, fn) {
        model.app.models.RoleMapping.find({
            include: ["role"],
            where: {
                principalId: id,
                // principalType: "USER"
            }
        }, function (err, data) {
            if (err) {
                fn(err);
            } else {
                fn(null, _.map(data, function (r, v) {
                    return r.role().name
                }));
            }
        });

    };
    model.remoteMethod('GetRoles', {
        description: "Get roles for Staff",
        accepts: [{
            arg: 'id',
            type: 'number',
            description: "USER ID",
            required: true,
        }, {
            arg: 'req',
            type: 'object',
            'http': {
                source: 'req'
            }
        }],
        returns: {
            arg: 'data',
            type: ["object"], //["Staff"],
            root: true
        },

        http: {
            verb: 'get',
            path: '/GetRoles'
        }
    });

    model.SetRoles = function (id, list, req, fn) {
        model.findById(id, function (err, user) {
            if (err) {
                fn(err);
            } else {
                model.app.models.CustomRoleMapping.deleteAll({
                    principalType: "USER",
                    principalId: id
                }, function () {
                    async.map(list, createRole, function (err, r) {
                        user.roles_list = r;
                        fn(err, user);
                    });
                });
            }
        });

        function createRole(aname, cb) {
            model.app.models.Role.find({
                where: {
                    name: aname
                }
            }, function (err, role) {
                if (err) {
                    cb(err);
                } else {
                    role = role[0];
                    if (!role) {
                        return cb("Unknown role: " + aname);
                    }
                    var rm = {
                        principalType: "USER",
                        principalId: id,
                        roleId: role.id
                    };
                    model.app.models.CustomRoleMapping.create(rm, function (err, r) {
                        console.log("NOT FOUND - ADDED", r);
                        cb(err, role);
                    });
                }
            });
        };


    };


    model.remoteMethod('SetRoles', {
        description: "Set roles for Staff",
        accepts: [{
            arg: 'id',
            type: 'number',
            description: "USER ID",
            required: true,
        }, {
            arg: 'list',
            type: 'array',
            description: "Array like [\"INITIATOR\",\"CONFIRMER\"]",
            required: true,
        }, {
            arg: 'req',
            type: 'object',
            'http': {
                source: 'req'
            }
        }],
        returns: {
            arg: 'data',
            type: "object", //["Staff"],
            root: true
        },

        http: {
            verb: 'post',
            path: '/SetRoles'
        }
    });

    model.afterRemote('login', function(ctx, unused, next) {
        //token skipped
        if (ctx.result.success) {
            return next();
        }
        model.app.models.RoleMapping.find({
            where: {
                principalType: 'USER',
                principalId: ctx.result.userId
            },
            include: "role"
        }, function(err, res) {
            if (err) {
                throw err;
            }
            ctx.result.roles = _.map(JSON.parse(JSON.stringify(res)), function(r) {
                var ret = {};
                ret[r.role.id] = r.role.name;

                return ret;
            });
            next();
        });

    });

    model.afterRemote('findById', function(ctx, unused, next) {
        async.series([
            function(callback) {
                model.app.models.RoleMapping.find({
                    where: {
                        principalType: 'USER',
                        principalId: ctx.result.id
                    },
                    include: "role"
                }, function(err, res) {
                    if (err) {
                        return callback(err);
                    }
                    var roles = {
                        roles: _.map(JSON.parse(JSON.stringify(res)), function(r) {
                            var ret = {};
                            ret[r.role.id] = r.role.name;
                            return ret;
                        })
                    };
                    callback(null, roles);
                });
            }
        ], function(error, results) {
            if (error) {
                next(error);
            }
            _.each(results, function(res) {
                _.extend(ctx.result, res);
            });
            next();
        });
    });

    model.login = function(credentials, include, fn) {
        var self = this;
        if (typeof include === 'function') {
            fn = include;
            include = undefined;
        }
        if (_.isArray(include)) {
            include = _.first(include);
        }
        include = (include || '').toLowerCase();

        var query = {};
        if (credentials.email) {
            query.email = credentials.email;
        } else if (credentials.username) {
            query.username = credentials.username.replace(/^.*?\\/, "").replace(/@.*?$/,"");
        } else {
            var err = new Error('Имя пользователя или email обязательны для ввода');
            err.statusCode = 400;
            return fn(err);
        }

        self.findOne({
            where: query
        }, function(err, user) {
            var defaultError = new Error('Пароль или пользователь не найдены. Попробуйте еще раз или обратитесь к администратору');
            defaultError.statusCode = 401;
            var defaultConnectError = new Error("Невозможно выполнить вход - сервер проверки не доступен. Обратитесь а администратору");
            defaultConnectError.statusCode = 401;

            if (err) {
                debug('An error is reported from User.findOne: %j', err);
                fn(defaultError);
            } else if (user) {
                if (user.realm == "AD") {
                    //TRIM USERNAME IN CASE NOT TRIMMED IN DATABASE
                    user.username = user.username.trim();
                    var adoptions = {
                        url: model.app.get("ad_no_ssl") ? 'ldap://' + model.app.get("ad_domain") + ':389': 'ldaps://' + model.app.get("ad_domain") + ':636',
                        baseDN: model.app.get("ad_base_dn"), //"OU=Unison,DC=""unison"",DC=loc",
                        username: user.username + "@" + model.app.get("ad_domain"),
                        password: credentials.password,
                        tlsOptions: {
                            rejectUnauthorized: false,
                        }
                    };
                    debug(adoptions);
                    var ad = new ActiveDirectory(adoptions);
                    ad.on("error", function(err){
                        console.log("AD error:", err);
                        fn(err.name == "InvalidCredentialsError" ? defaultError : err);
                    });
                    debug("Start AD auth: " + user.username + "@" + model.app.get("ad_domain"));
                    ad.authenticate(user.username+ "@" + model.app.get("ad_domain"), credentials.password, function(err, auth) {
                        debug("AD response:  error: %s %s", err, auth);
                        if (err) {
                            console.log(JSON.stringify(err));
                            if (err && err.name && err.name == "InvalidCredentialsError") {
                                return fn(defaultError);
                            } else {
                                return fn(defaultConnectError);
                            }
                        }
                        if (!auth) {
                            return fn(defaultError);
                        }
                        //skip token generation
                        if (credentials.skip_token) {
                            return fn(null, {success: true, user: user});
                        }
                        if (include === 'user') {
                            ad.findUser({}, user.username, function(err, aduser) {
                                debug("AD findUser result: error: %s user: %j" , err, user);
                                if (err) {
                                    return fn(err);
                                }
                                user.createAccessToken(credentials.ttl, function(err, token) {
                                    if (err) return fn(err);
                                    if (include === 'user') {
                                        token.__data.user = user;
                                    }
                                    token._ad_user = aduser;
                                    fn(err, token);
                                });
                            });
                        } else {
                            user.createAccessToken(credentials.ttl, fn);
                        }
                    });
                } else {
                    user.hasPassword(credentials.password, function(err, isMatch) {
                        if (err) {
                            debug('An error is reported from User.hasPassword: %j', err);
                            fn(defaultError);
                        } else if (isMatch) {
                            user.createAccessToken(credentials.ttl, function(err, token) {
                                if (err) return fn(err);
                                if (include === 'user') {
                                    token.__data.user = user;
                                }
                                fn(err, token);
                            });
                        } else {
                            debug('The password is invalid for user %s', query.email || query.username);
                            fn(defaultError);
                        }
                    });

                }
            } else {
                console.log('No matching record is found for user %s', query.email || query.username);
                fn(defaultError);
            }
        });

    };


/*
    model.remoteMethod(
        "login", {
            description: 'Login a user with username/email and password',
            accepts: [{
                arg: 'credentials',
                type: 'object',
                required: true,
                http: {
                    source: 'body'
                }
            }, {
                arg: 'include',
                type: 'string',
                http: {
                    source: 'query'
                },
                description: 'Related objects to include in the response. ' +
                    'See the description of return value for more details.'
            }],
            returns: {
                arg: 'accessToken',
                type: 'object',
                root: true,
                description: 'The response body contains properties of the AccessToken created on login.\n' +
                    'Depending on the value of `include` parameter, the body may contain ' +
                    'additional properties:\n\n' +
                    '  - `user` - `{User}` - Data of the currently logged in user. (`include=user`)\n\n'
            },
            http: {
                verb: 'post'
            }
        }
    );

*/

    model.getUserEmail = function(username, fn) {
        if (!username) return fn({message: "missing <username>"});
        model.app.models.Staff.findOne({
            where:{
                username: username,
            },
        }, function(err, user){
            fn(err, user && user.email ? user.email : null);
        });
    }

    model.remoteMethod(
        "getUserEmail", {
            description: 'user e-mail',
            accepts: [{
                arg: 'username',
                type: 'string',
            }],
            returns: {
                arg: 'data',
                type: 'string',
                root: true,
                description: 'user email info'
            },
            http: {
                verb: 'get'
            }
        }
    );
}
