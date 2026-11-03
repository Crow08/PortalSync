// Production build: the server serves the client (Spring, Docker, behind a TLS proxy), so everything is on the origin the
// page was loaded from. The same build works on every host name; the host name only lives in the proxy and in the
// server's client.origin.
const origin = window.location.origin;

export const environment = {
  production: true,
  dbServer: origin,
  frontendServer: origin,
  wsServer: origin.replace(/^http/, 'ws'),
};
