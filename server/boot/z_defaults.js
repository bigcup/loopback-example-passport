module.exports = function(server, next) {
    var Role = server.models.Role;
    var RoleMapping = server.models.RoleMapping;
    var Staff = server.models.Staff;
    var _ = require("underscore");
    var async = require("async");

    var roles = [{
        "ADMIN" : "999"
    }, {
        "USER" : "1"
    }];

    function ensure(r, cb) {
        var aname = _.keys(r)[0];
        var aid = r[aname];

        Role.upsert({
            id : aid,
            name : aname
        }, cb);
    }

    async.map(roles, ensure, function(err, data) {
        createUsers();
    });

    function createUsers() {
        var users = [{
            "username": "admin",
            "password": "admin",
            "email": "admin@bar.com",
            "roleId": '999'
        },{
            "username": "user",
            "password": "user",
            "email": "user@bar.com",
            "roleId": '1'
        }];

        async.map(users, function(user, cb) {
            Staff.findOne({
                where : {
                    username : user.username
                }
            }, function(err, u) {
                if (err) return cb(err);
                if (!u) {
                    var roleId = user.roleId;
                    delete user.roleId;

                    Staff.create(user, function(err, created) {
                        if (err) return cb(err);

                        console.log(created);

                        RoleMapping.create({
                            roleId : roleId,
                            principalId : created.getId(),
                            principalType : "USER"
                        }, cb);
                    })
                } else {
                	cb();
                }
            });
        }, function(err, data) {
            console.log("USERS AND ROLES ARE CHECKED", err);
            next()
        });
    }
};
