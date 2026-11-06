// Public identifiers only. Nothing here is a secret.

// Fixes the extension ID on every computer, which Chrome's Google sign-in requires.
// Only the public half of the key exists; the private half was never kept.
export const EXTENSION_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsnrd/8CpJ6Gmf4exMd62p+HzpxmDFAxpre2XCc13wwyGW6dtK9qCnKPiH86r/9qhNQWzLGsvXda05uF9TdhfzqreBxl6H/6xher22+opc6x7c/OChPQqzdlHnjITFQvk6TE/n3Mwz3V6C91MfTK9Tsyp1poxPIz317hDBfTN0SbWhyqgmKOXJwQaGEyeJpgZjxmdcNbFn0c2yUOQholbNLkjm7TMlz26tHLvpgnB8PRgl+11M/7IALEmdVz4Rdw6TMXxSkAkAAwLvuWh1Wpx0OxzsrDX6+7FB/la/b4yAZ/4Oy+t3WpMDC8A2JA7YlBvvLrQPbYvne/hMdDj3M5R8wIDAQAB';
export const EXTENSION_ID = 'kdodgbabpmjhbbehpmcnhfkeeiceaiec';

// OAuth client of type "Chrome Extension" in the church-mt project.
export const OAUTH_CLIENT_ID = '38407140130-iuhs8kfo93fas3pfkle63rva0c4mh25j.apps.googleusercontent.com';
export const OAUTH_SCOPES = ['https://www.googleapis.com/auth/datastore'];

export const FIRESTORE_DOCUMENTS = 'https://firestore.googleapis.com/v1/projects/church-mt/databases/(default)/documents';
