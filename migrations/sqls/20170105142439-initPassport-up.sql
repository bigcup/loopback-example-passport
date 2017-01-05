CREATE TABLE `User_Identity` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(45) NULL,
  `auth_scheme` VARCHAR(45) NULL,
  `external_id` VARCHAR(45) NULL,
  `profile` TEXT NULL,
  `credentials` TEXT NULL,
  `user_id` INT NULL,
  `created` DATETIME NULL,
  `modified` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `id_UNIQUE` (`id` ASC),
  INDEX `fk_staff_id_idx` (`user_id` ASC),
  CONSTRAINT `fk_identity_staff_id`
    FOREIGN KEY (`user_id`)
    REFERENCES `Staff` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE);

CREATE TABLE `User_Credential` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(45) NULL,
  `auth_scheme` VARCHAR(45) NULL,
  `external_id` VARCHAR(45) NULL,
  `profile` TEXT NULL,
  `credentials` TEXT NULL,
  `user_id` INT NULL,
  `created` DATETIME NULL,
  `modified` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `id_UNIQUE` (`id` ASC),
  INDEX `fk_staff_id_idx` (`user_id` ASC),
  CONSTRAINT `fk_credential_staff_id`
    FOREIGN KEY (`user_id`)
    REFERENCES `Staff` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE);
