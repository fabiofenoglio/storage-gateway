/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `doc_acl_client_tenant_record`
--

DROP TABLE IF EXISTS `doc_acl_client_tenant_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_acl_client_tenant_record` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `clientIdentifier` varchar(255) NOT NULL,
  `policy` varchar(255) NOT NULL,
  `engineVersion` int(11) NOT NULL,
  `tenantId` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_acl_client_tenant_record_UN` (`tenantId`,`clientIdentifier`),
  CONSTRAINT `doc_acl_client_tenant_record_FK` FOREIGN KEY (`tenantId`) REFERENCES `doc_client_tenant` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_acl_storage_node_record`
--

DROP TABLE IF EXISTS `doc_acl_storage_node_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_acl_storage_node_record` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `clientIdentifier` varchar(255) NOT NULL,
  `policy` varchar(255) NOT NULL,
  `recursive` tinyint(1) NOT NULL,
  `engineVersion` int(11) NOT NULL,
  `nodeId` int(11) NOT NULL,
  `tenantId` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_acl_storage_node_record_UN` (`nodeId`,`clientIdentifier`),
  KEY `doc_acl_storage_node_record_FK_2` (`tenantId`),
  CONSTRAINT `doc_acl_storage_node_record_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`),
  CONSTRAINT `doc_acl_storage_node_record_FK_2` FOREIGN KEY (`tenantId`) REFERENCES `doc_client_tenant` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_backblaze_backbone_tenant`
--

DROP TABLE IF EXISTS `doc_backblaze_backbone_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_backblaze_backbone_tenant` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `applicationKey` varchar(2048) NOT NULL,
  `applicationKeySecret` varchar(2048) NOT NULL,
  `bucketId` varchar(512) NOT NULL,
  `rootLocation` varchar(512) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_backblaze_backbone_tenant_UN` (`bucketId`,`rootLocation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_client_tenant`
--

DROP TABLE IF EXISTS `doc_client_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_client_tenant` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `engineVersion` int(11) NOT NULL,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `backboneType` varchar(255) NOT NULL,
  `backboneId` int(11) NOT NULL,
  `rootLocation` varchar(2048) NOT NULL,
  `ownerIdentifier` varchar(512) DEFAULT NULL,
  `enableThumbnails` tinyint(1) DEFAULT NULL,
  `encryptionAlgorithm` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_client_tenant_UN` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_cronjob`
--

DROP TABLE IF EXISTS `doc_cronjob`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_cronjob` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_cronjob_UN` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_cronjob_execution`
--

DROP TABLE IF EXISTS `doc_cronjob_execution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_cronjob_execution` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jobId` int(11) NOT NULL,
  `status` varchar(100) NOT NULL,
  `startedAt` datetime NOT NULL,
  `finishedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `doc_cronjob_execution_FK` (`jobId`),
  CONSTRAINT `doc_cronjob_execution_FK` FOREIGN KEY (`jobId`) REFERENCES `doc_cronjob` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=276 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_cronjob_execution_message`
--

DROP TABLE IF EXISTS `doc_cronjob_execution_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_cronjob_execution_message` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `executionId` int(11) NOT NULL,
  `reportedAt` datetime NOT NULL,
  `level` varchar(100) NOT NULL,
  `name` varchar(1024) DEFAULT NULL,
  `message` text NOT NULL,
  `additionals` text,
  PRIMARY KEY (`id`),
  KEY `doc_cronjob_execution_message_FK` (`executionId`),
  CONSTRAINT `doc_cronjob_execution_message_FK` FOREIGN KEY (`executionId`) REFERENCES `doc_cronjob_execution` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_filesystem_backbone_tenant`
--

DROP TABLE IF EXISTS `doc_filesystem_backbone_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_filesystem_backbone_tenant` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `relativePath` varchar(2048) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_filesystem_content`
--

DROP TABLE IF EXISTS `doc_filesystem_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_filesystem_content` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `uuid` varchar(255) NOT NULL,
  `nodeUuid` varchar(255) DEFAULT NULL,
  `engineVersion` int(11) NOT NULL,
  `key` varchar(255) NOT NULL,
  `mimeType` varchar(1024) DEFAULT NULL,
  `encoding` varchar(1024) DEFAULT NULL,
  `contentSize` bigint(20) unsigned DEFAULT NULL,
  `originalName` varchar(1024) DEFAULT NULL,
  `metadata` text,
  `nodeId` int(11) DEFAULT NULL,
  `storagePath` varchar(2048) NOT NULL,
  `status` varchar(10) NOT NULL,
  `deletedAt` datetime DEFAULT NULL,
  `lastDeleteAttemptAt` datetime DEFAULT NULL,
  `statusActive` tinyint(1) GENERATED ALWAYS AS (if((`status` = 'ACTIVE'),1,NULL)) STORED,
  `encryption` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_filesystem_content_UN` (`uuid`),
  UNIQUE KEY `doc_filesystem_content_key_IDX` (`key`,`statusActive`,`nodeId`) USING BTREE,
  KEY `doc_filesystem_content_FK` (`nodeId`),
  KEY `doc_filesystem_content_FK_1` (`nodeUuid`),
  KEY `doc_filesystem_content_status_IDX` (`status`) USING BTREE,
  CONSTRAINT `doc_filesystem_content_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`),
  CONSTRAINT `doc_filesystem_content_FK_1` FOREIGN KEY (`nodeUuid`) REFERENCES `doc_storage_node` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_msgraph_token`
--

DROP TABLE IF EXISTS `doc_msgraph_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_msgraph_token` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tokenType` varchar(255) NOT NULL,
  `scope` varchar(255) NOT NULL,
  `accessToken` varchar(8192) NOT NULL,
  `refreshToken` varchar(8192) DEFAULT NULL,
  `expiresAt` datetime DEFAULT NULL,
  `issuedAt` datetime NOT NULL,
  `requestedAt` datetime DEFAULT NULL,
  `expiresIn` int(11) DEFAULT NULL,
  `extExpiresIn` int(11) DEFAULT NULL,
  `refreshedAt` datetime DEFAULT NULL,
  `refreshRequestedAt` datetime DEFAULT NULL,
  `userPrincipalName` varchar(255) DEFAULT NULL,
  `userPrincipalId` varchar(255) DEFAULT NULL,
  `associatedClient` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_onedrive_backbone_tenant`
--

DROP TABLE IF EXISTS `doc_onedrive_backbone_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_onedrive_backbone_tenant` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `ownerPrincipalId` varchar(255) NOT NULL,
  `driveId` varchar(255) NOT NULL,
  `rootLocation` varchar(2048) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_onedrive_content`
--

DROP TABLE IF EXISTS `doc_onedrive_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_onedrive_content` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `uuid` varchar(255) NOT NULL,
  `nodeUuid` varchar(255) NOT NULL,
  `engineVersion` int(11) NOT NULL,
  `key` varchar(255) NOT NULL,
  `mimeType` varchar(1024) DEFAULT NULL,
  `encoding` varchar(1024) DEFAULT NULL,
  `contentSize` bigint(20) unsigned DEFAULT NULL,
  `originalName` varchar(1024) DEFAULT NULL,
  `metadata` text,
  `nodeId` int(11) NOT NULL,
  `onedrivePath` varchar(2048) NOT NULL,
  `onedriveId` varchar(255) NOT NULL,
  `onedriveETag` varchar(1024) NOT NULL,
  `onedriveCTag` varchar(1024) NOT NULL,
  `onedriveItem` text NOT NULL,
  `status` varchar(10) NOT NULL,
  `deletedAt` datetime DEFAULT NULL,
  `lastDeleteAttemptAt` datetime DEFAULT NULL,
  `statusActive` tinyint(1) GENERATED ALWAYS AS (if((`status` = 'ACTIVE'),1,NULL)) STORED,
  `encryption` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_onedrive_content_UN` (`uuid`),
  UNIQUE KEY `doc_onedrive_content_UN_1` (`onedriveId`),
  UNIQUE KEY `doc_onedrive_content_key_IDX` (`key`,`statusActive`,`nodeId`) USING BTREE,
  KEY `doc_onedrive_content_FK` (`nodeId`),
  KEY `doc_onedrive_content_FK_1` (`nodeUuid`),
  KEY `doc_onedrive_content_status_IDX` (`status`) USING BTREE,
  CONSTRAINT `doc_onedrive_content_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`),
  CONSTRAINT `doc_onedrive_content_FK_1` FOREIGN KEY (`nodeUuid`) REFERENCES `doc_storage_node` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=533 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_resource_lock`
--

DROP TABLE IF EXISTS `doc_resource_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_resource_lock` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `resourceCode` varchar(255) NOT NULL,
  `ownerCode` varchar(255) NOT NULL,
  `expiresAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_resource_lock_UN` (`resourceCode`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_s3_backbone_tenant`
--

DROP TABLE IF EXISTS `doc_s3_backbone_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_s3_backbone_tenant` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `dialect` varchar(255) DEFAULT NULL,
  `endpoint` varchar(1024) NOT NULL,
  `region` varchar(255) DEFAULT NULL,
  `enableSsl` tinyint(1) DEFAULT NULL,
  `authenticationSchema` varchar(255) NOT NULL,
  `credentials` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_s3_content`
--

DROP TABLE IF EXISTS `doc_s3_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_s3_content` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `uuid` varchar(255) NOT NULL,
  `nodeId` int(11) NOT NULL,
  `nodeUuid` varchar(255) NOT NULL,
  `engineVersion` int(11) NOT NULL,
  `key` varchar(255) NOT NULL,
  `originalName` varchar(1024) DEFAULT NULL,
  `mimeType` varchar(1024) DEFAULT NULL,
  `encoding` varchar(1024) DEFAULT NULL,
  `contentSize` bigint(20) unsigned DEFAULT NULL,
  `metadata` text,
  `encryption` varchar(500) DEFAULT NULL,
  `status` varchar(10) NOT NULL,
  `statusActive` tinyint(1) GENERATED ALWAYS AS (if((`status` = 'ACTIVE'),1,NULL)) STORED,
  `deletedAt` datetime DEFAULT NULL,
  `lastDeleteAttemptAt` datetime DEFAULT NULL,
  `remoteId` varchar(1024) NOT NULL,
  `remoteETag` varchar(1024) DEFAULT NULL,
  `remoteItem` text NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_s3_content_UN` (`uuid`),
  UNIQUE KEY `doc_s3_content_UN_1` (`remoteId`),
  UNIQUE KEY `doc_s3_content_key_IDX` (`key`,`statusActive`,`nodeId`) USING BTREE,
  KEY `doc_s3_content_FK` (`nodeId`),
  KEY `doc_s3_content_FK_1` (`nodeUuid`),
  KEY `doc_s3_content_status_IDX` (`status`) USING BTREE,
  CONSTRAINT `doc_s3_content_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`),
  CONSTRAINT `doc_s3_content_FK_1` FOREIGN KEY (`nodeUuid`) REFERENCES `doc_storage_node` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_storage_node`
--

DROP TABLE IF EXISTS `doc_storage_node`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_storage_node` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `tenantId` int(11) NOT NULL,
  `uuid` varchar(255) NOT NULL,
  `parentUuid` varchar(255) DEFAULT NULL,
  `engineVersion` int(11) NOT NULL,
  `nodeType` varchar(255) NOT NULL,
  `name` varchar(1024) NOT NULL,
  `parentId` int(11) DEFAULT NULL,
  `status` varchar(10) NOT NULL,
  `deletedAt` datetime DEFAULT NULL,
  `lastDeleteAttemptAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_storage_node_UN` (`uuid`),
  KEY `doc_storage_node_FK` (`parentId`),
  KEY `doc_storage_node_FK_1` (`parentUuid`),
  KEY `doc_storage_node_FK_2` (`tenantId`),
  KEY `doc_storage_node_status_IDX` (`status`) USING BTREE,
  CONSTRAINT `doc_storage_node_FK` FOREIGN KEY (`parentId`) REFERENCES `doc_storage_node` (`id`),
  CONSTRAINT `doc_storage_node_FK_1` FOREIGN KEY (`parentUuid`) REFERENCES `doc_storage_node` (`uuid`),
  CONSTRAINT `doc_storage_node_FK_2` FOREIGN KEY (`tenantId`) REFERENCES `doc_client_tenant` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3191 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_storage_node_metadata`
--

DROP TABLE IF EXISTS `doc_storage_node_metadata`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_storage_node_metadata` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `value` text NOT NULL,
  `engineVersion` int(11) NOT NULL,
  `nodeId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_storage_node_metadata_UN` (`nodeId`,`key`),
  CONSTRAINT `doc_storage_node_metadata_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8900 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_storage_node_share`
--

DROP TABLE IF EXISTS `doc_storage_node_share`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_storage_node_share` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `modifiedBy` varchar(255) DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `uuid` varchar(255) NOT NULL,
  `accessToken` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `engineVersion` int(11) NOT NULL,
  `nodeId` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_storage_node_share_UN_1` (`uuid`),
  UNIQUE KEY `doc_storage_node_share_UN_2` (`accessToken`),
  KEY `doc_storage_node_share_FK` (`nodeId`),
  CONSTRAINT `doc_storage_node_share_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3098 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_upload_session`
--

DROP TABLE IF EXISTS `doc_upload_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_upload_session` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(100) NOT NULL,
  `status` varchar(100) NOT NULL,
  `createdAt` datetime NOT NULL,
  `createdBy` varchar(255) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `nodeId` int(11) NOT NULL,
  `nodeUuid` varchar(255) NOT NULL,
  `mimeType` varchar(255) NOT NULL,
  `encoding` varchar(255) NOT NULL,
  `contentSize` bigint(20) unsigned NOT NULL,
  `originalName` varchar(1024) NOT NULL,
  `md5` varchar(255) DEFAULT NULL,
  `sha1` varchar(255) DEFAULT NULL,
  `sha256` varchar(255) DEFAULT NULL,
  `version` bigint(20) unsigned DEFAULT NULL,
  `transitionedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_upload_session_UN` (`uuid`),
  KEY `doc_upload_session_FK` (`nodeId`),
  KEY `doc_upload_session_FK_1` (`nodeUuid`),
  CONSTRAINT `doc_upload_session_FK` FOREIGN KEY (`nodeId`) REFERENCES `doc_storage_node` (`id`),
  CONSTRAINT `doc_upload_session_FK_1` FOREIGN KEY (`nodeUuid`) REFERENCES `doc_storage_node` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_upload_session_part`
--

DROP TABLE IF EXISTS `doc_upload_session_part`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `doc_upload_session_part` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sessionId` int(11) NOT NULL,
  `partNumber` int(11) NOT NULL,
  `uuid` varchar(100) NOT NULL,
  `status` varchar(100) NOT NULL,
  `uploadedAt` datetime NOT NULL,
  `statusActive` tinyint(1) GENERATED ALWAYS AS (if((`status` = 'ACTIVE'),1,NULL)) STORED,
  `size` int(11) NOT NULL,
  `transitionedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_upload_session_part_UN` (`uuid`),
  UNIQUE KEY `doc_upload_session_part_key_IDX` (`sessionId`,`partNumber`,`statusActive`) USING BTREE,
  KEY `doc_upload_session_part_FK` (`sessionId`),
  CONSTRAINT `doc_upload_session_part_FK` FOREIGN KEY (`sessionId`) REFERENCES `doc_upload_session` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
