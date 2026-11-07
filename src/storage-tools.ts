import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { output } from './api.js';
const text = z.string().min(1);
const bucket = text.max(63).optional();
const object = { key: text.max(1024), bucket };
const encode = encodeURIComponent;
export function registerStorageTools(server: McpServer) {
  server.registerTool('nexode_storage_available', { description: 'Check whether managed S3 provisioning is configured.' }, async () => output('/storage/available'));
  server.registerTool('nexode_storage_provision', { description: 'Provision workspace S3, returning a one-time secret. Requires storage:write and storage:connect. Use server-side Compute linking when deploying; never paste secretKey in chat or commit it.' }, async () => output('/storage/provision', 'POST'));
  server.registerTool('nexode_storage_rotate_key', { description: 'Rotate the workspace primary S3 credential; existing consumers must be updated. Requires explicit rotation instruction, storage:write and storage:connect. Never echo the one-time secret.' }, async () => output('/storage/rotate-key', 'POST'));
  server.registerTool('nexode_storage_buckets', { description: 'List S3 buckets of this workspace (storage:read).' }, async () => output('/storage/buckets'));
  server.registerTool('nexode_storage_create_bucket', { description: 'Create a workspace S3 bucket (storage:write).', inputSchema: { name: text.min(3).max(63) } }, async input => output('/storage/buckets', 'POST', input));
  server.registerTool('nexode_storage_delete_bucket', { description: 'Delete an explicitly selected S3 bucket (storage:write). Backend rejects non-empty buckets; never silently empty one to bypass this.', inputSchema: { name: text.max(63) } }, async ({ name }) => output(`/storage/buckets/${encode(name)}`, 'DELETE'));
  server.registerTool('nexode_storage_objects', { description: 'Browse S3 objects and folders, following the returned pagination token. Requires storage:read.', inputSchema: { bucket, prefix: z.string().max(1024).optional(), continuation_token: text.optional() } }, async input => output(`/storage/objects?${new URLSearchParams(Object.entries(input).filter(([,v]) => v !== undefined) as [string,string][]).toString()}`));
  server.registerTool('nexode_storage_upload_url', { description: 'Get a signed upload URL for the exact key and content type (storage:write). Upload bytes with local HTTP/file tooling; this call does not upload. Treat the URL as a temporary credential.', inputSchema: { ...object, content_type: text.max(255) } }, async input => output('/storage/upload-url', 'POST', input));
  server.registerTool('nexode_storage_download_url', { description: 'Get a temporary signed download URL (storage:read). The URL grants access to the object; do not publish it unintentionally.', inputSchema: object }, async input => output('/storage/download-url', 'POST', input));
  server.registerTool('nexode_storage_delete_object', { description: 'Permanently delete an explicitly selected object (storage:write). Verify the exact bucket and key.', inputSchema: object }, async input => output('/storage/objects', 'DELETE', input));
  server.registerTool('nexode_storage_keys', { description: 'List workspace S3 key metadata without secrets (storage:read).' }, async () => output('/storage/keys'));
  server.registerTool('nexode_storage_create_key', { description: 'Create an S3 key scoped to a bucket/prefix and permission, optionally expiring. Requires storage:write and storage:connect. Use least privilege; never echo or commit the returned one-time secret.', inputSchema: { name: text.max(120), bucket, permission: z.enum(['readwrite', 'read', 'write']), prefix: z.string().max(1024).optional(), expires_in_days: z.number().int().min(1).max(365).optional() } }, async input => output('/storage/keys', 'POST', input));
  server.registerTool('nexode_storage_delete_key', { description: 'Revoke the selected S3 access key (storage:write and storage:connect). Applications using it lose access.', inputSchema: { access_key: text } }, async ({ access_key }) => output(`/storage/keys/${encode(access_key)}`, 'DELETE'));
}
