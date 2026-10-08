import got from 'got';

export const externalHttpTransport = got.extend({
  retry: { limit: 0 },
  throwHttpErrors: false,
});
