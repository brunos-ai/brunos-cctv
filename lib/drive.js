const { Readable } = require('stream');
const { drive } = require('./google');

function folderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set');
  return id;
}

/**
 * Upload a PNG buffer to Drive, share it as anyone-with-link viewable,
 * and return the public web view URL.
 */
async function uploadSignaturePng(buffer, filename) {
  const api = await drive();
  // supportsAllDrives: true is required when the parent folder lives in a
  // Shared Drive rather than My Drive. Service accounts can't own files in
  // personal Drive (they have no storage quota), so the signatures folder
  // MUST be inside a Shared Drive in production.
  const res = await api.files.create({
    requestBody: {
      name: filename,
      parents: [folderId()],
      mimeType: 'image/png',
    },
    media: {
      mimeType: 'image/png',
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  // Make the file viewable by anyone with the link so it renders in the Sheet
  await api.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });
  return res.data.webViewLink;
}

module.exports = { uploadSignaturePng };
