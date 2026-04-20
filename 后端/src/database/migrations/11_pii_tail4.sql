-- R1/T-R1-11: 身份证后 4 位脱敏展示列
-- user / rider 表各加 id_card_tail4 VARCHAR(4)
-- 仅存储后4位，用于管理后台脱敏列表展示，避免全量查询加密身份证列

ALTER TABLE `user` ADD COLUMN `id_card_tail4` VARCHAR(4) NULL COMMENT '身份证后4位（脱敏展示）' AFTER `id_card_enc`;

ALTER TABLE `rider` ADD COLUMN `id_card_tail4` VARCHAR(4) NULL COMMENT '身份证后4位（脱敏展示）' AFTER `id_card_enc`;
