-- Rename tables, columns, enum types, constraints and indexes to snake_case per
-- the PostgreSQL naming conventions. Pure renames: no data is touched, and the
-- partial unique indexes (one_current_version_per_document, one_draft_per_document)
-- follow their table automatically.

-- Enum types
ALTER TYPE "VersionStatus" RENAME TO version_status;
ALTER TYPE "ReviewStatus" RENAME TO review_status;

-- Columns (before the tables are renamed)
ALTER TABLE "User" RENAME COLUMN "passwordHash" TO password_hash;
ALTER TABLE "User" RENAME COLUMN "roleId" TO role_id;
ALTER TABLE "User" RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE "Category" RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE "CategoryMembership" RENAME COLUMN "userId" TO user_id;
ALTER TABLE "CategoryMembership" RENAME COLUMN "categoryId" TO category_id;
ALTER TABLE "CategoryMembership" RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE "Document" RENAME COLUMN "categoryId" TO category_id;
ALTER TABLE "Document" RENAME COLUMN "authorId" TO author_id;
ALTER TABLE "Document" RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE "Document" RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE "DocumentVersion" RENAME COLUMN "documentId" TO document_id;
ALTER TABLE "DocumentVersion" RENAME COLUMN "versionNumber" TO version_number;
ALTER TABLE "DocumentVersion" RENAME COLUMN "filePath" TO file_path;
ALTER TABLE "DocumentVersion" RENAME COLUMN "fileName" TO file_name;
ALTER TABLE "DocumentVersion" RENAME COLUMN "mimeType" TO mime_type;
ALTER TABLE "DocumentVersion" RENAME COLUMN "uploadedById" TO uploaded_by_id;
ALTER TABLE "DocumentVersion" RENAME COLUMN "uploadedAt" TO uploaded_at;
ALTER TABLE "DocumentVersion" RENAME COLUMN "isCurrent" TO is_current;
ALTER TABLE "Review" RENAME COLUMN "versionId" TO version_id;
ALTER TABLE "Review" RENAME COLUMN "reviewerId" TO reviewer_id;
ALTER TABLE "Review" RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE "Approval" RENAME COLUMN "versionId" TO version_id;
ALTER TABLE "Approval" RENAME COLUMN "approverId" TO approver_id;
ALTER TABLE "Approval" RENAME COLUMN "approvedAt" TO approved_at;
ALTER TABLE "Comment" RENAME COLUMN "versionId" TO version_id;
ALTER TABLE "Comment" RENAME COLUMN "authorId" TO author_id;
ALTER TABLE "Comment" RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE "Comment" RENAME COLUMN "anchorQuote" TO anchor_quote;
ALTER TABLE "Comment" RENAME COLUMN "anchorPrefix" TO anchor_prefix;
ALTER TABLE "Comment" RENAME COLUMN "anchorSuffix" TO anchor_suffix;
ALTER TABLE "Comment" RENAME COLUMN "anchorStart" TO anchor_start;
ALTER TABLE "Comment" RENAME COLUMN "anchorEnd" TO anchor_end;
ALTER TABLE "AuditEvent" RENAME COLUMN "actorId" TO actor_id;
ALTER TABLE "AuditEvent" RENAME COLUMN "documentId" TO document_id;
ALTER TABLE "AuditEvent" RENAME COLUMN "versionId" TO version_id;
ALTER TABLE "AuditEvent" RENAME COLUMN "timestamp" TO occurred_at;

-- Tables
ALTER TABLE "Role" RENAME TO roles;
ALTER TABLE "User" RENAME TO users;
ALTER TABLE "Category" RENAME TO categories;
ALTER TABLE "CategoryMembership" RENAME TO category_memberships;
ALTER TABLE "Document" RENAME TO documents;
ALTER TABLE "DocumentVersion" RENAME TO document_versions;
ALTER TABLE "Review" RENAME TO reviews;
ALTER TABLE "Approval" RENAME TO approvals;
ALTER TABLE "Comment" RENAME TO comments;
ALTER TABLE "AuditEvent" RENAME TO audit_events;

-- Constraints
ALTER TABLE users RENAME CONSTRAINT "User_pkey" TO users_pkey;
ALTER TABLE categories RENAME CONSTRAINT "Category_pkey" TO categories_pkey;
ALTER TABLE category_memberships RENAME CONSTRAINT "CategoryMembership_pkey" TO category_memberships_pkey;
ALTER TABLE documents RENAME CONSTRAINT "Document_pkey" TO documents_pkey;
ALTER TABLE document_versions RENAME CONSTRAINT "DocumentVersion_pkey" TO document_versions_pkey;
ALTER TABLE reviews RENAME CONSTRAINT "Review_pkey" TO reviews_pkey;
ALTER TABLE approvals RENAME CONSTRAINT "Approval_pkey" TO approvals_pkey;
ALTER TABLE comments RENAME CONSTRAINT "Comment_pkey" TO comments_pkey;
ALTER TABLE audit_events RENAME CONSTRAINT "AuditEvent_pkey" TO audit_events_pkey;
ALTER TABLE category_memberships RENAME CONSTRAINT "CategoryMembership_userId_fkey" TO category_memberships_user_id_fkey;
ALTER TABLE category_memberships RENAME CONSTRAINT "CategoryMembership_categoryId_fkey" TO category_memberships_category_id_fkey;
ALTER TABLE documents RENAME CONSTRAINT "Document_categoryId_fkey" TO documents_category_id_fkey;
ALTER TABLE documents RENAME CONSTRAINT "Document_authorId_fkey" TO documents_author_id_fkey;
ALTER TABLE document_versions RENAME CONSTRAINT "DocumentVersion_documentId_fkey" TO document_versions_document_id_fkey;
ALTER TABLE document_versions RENAME CONSTRAINT "DocumentVersion_uploadedById_fkey" TO document_versions_uploaded_by_id_fkey;
ALTER TABLE reviews RENAME CONSTRAINT "Review_versionId_fkey" TO reviews_version_id_fkey;
ALTER TABLE reviews RENAME CONSTRAINT "Review_reviewerId_fkey" TO reviews_reviewer_id_fkey;
ALTER TABLE approvals RENAME CONSTRAINT "Approval_versionId_fkey" TO approvals_version_id_fkey;
ALTER TABLE approvals RENAME CONSTRAINT "Approval_approverId_fkey" TO approvals_approver_id_fkey;
ALTER TABLE comments RENAME CONSTRAINT "Comment_versionId_fkey" TO comments_version_id_fkey;
ALTER TABLE comments RENAME CONSTRAINT "Comment_authorId_fkey" TO comments_author_id_fkey;
ALTER TABLE audit_events RENAME CONSTRAINT "AuditEvent_actorId_fkey" TO audit_events_actor_id_fkey;
ALTER TABLE audit_events RENAME CONSTRAINT "AuditEvent_documentId_fkey" TO audit_events_document_id_fkey;
ALTER TABLE audit_events RENAME CONSTRAINT "AuditEvent_versionId_fkey" TO audit_events_version_id_fkey;
ALTER TABLE roles RENAME CONSTRAINT "Role_pkey" TO roles_pkey;
ALTER TABLE users RENAME CONSTRAINT "User_roleId_fkey" TO users_role_id_fkey;

-- Indexes
ALTER INDEX "User_email_key" RENAME TO users_email_key;
ALTER INDEX "Category_name_key" RENAME TO categories_name_key;
ALTER INDEX "CategoryMembership_categoryId_idx" RENAME TO category_memberships_category_id_idx;
ALTER INDEX "CategoryMembership_userId_categoryId_key" RENAME TO category_memberships_user_id_category_id_key;
ALTER INDEX "DocumentVersion_documentId_isCurrent_idx" RENAME TO document_versions_document_id_is_current_idx;
ALTER INDEX "DocumentVersion_documentId_versionNumber_idx" RENAME TO document_versions_document_id_version_number_idx;
ALTER INDEX "DocumentVersion_documentId_versionNumber_key" RENAME TO document_versions_document_id_version_number_key;
ALTER INDEX "Approval_versionId_key" RENAME TO approvals_version_id_key;
ALTER INDEX "Comment_versionId_idx" RENAME TO comments_version_id_idx;
ALTER INDEX "AuditEvent_documentId_timestamp_idx" RENAME TO audit_events_document_id_occurred_at_idx;
ALTER INDEX "Document_categoryId_updatedAt_idx" RENAME TO documents_category_id_updated_at_idx;
ALTER INDEX "Review_versionId_status_idx" RENAME TO reviews_version_id_status_idx;
ALTER INDEX "Role_name_key" RENAME TO roles_name_key;
ALTER INDEX "User_roleId_idx" RENAME TO users_role_id_idx;
