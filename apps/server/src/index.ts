import { startServer } from './server';

const server = await startServer({ logger: true });

// eslint-disable-next-line no-console
console.log(
  `Auteur sunucusu çalışıyor:\n` +
    `  REST : ${server.url}\n` +
    `  WS   : ${server.wsUrl}\n` +
    `  TLS  : ${server.tls ? 'açık (HTTPS/WSS)' : 'KAPALI — trafik şifrelenmiyor'}\n` +
    `  Veri : ${server.dataDir}\n` +
    `  Sağlık kontrolü: ${server.url}/api/health`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    /* `close()` odaları diske YAZARAK kapatıyor; sinyal yolunda beklenmesi
       şart, yoksa planlı kapanış son turdan sonraki işi götürür. */
    void server.close().then(() => process.exit(0));
  });
}
