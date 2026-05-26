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
  });
  // Make the file viewable by anyone with the link so it renders in the Sheet
  await api.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });
  return res.data.webViewLink;
}

module.exports = { uploadSignaturePng };
