import { buildApp } from './app.js';

const app = buildApp();

app.listen({ port: 3000 }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }

  console.log(`Server is running on ${address}`);
});
