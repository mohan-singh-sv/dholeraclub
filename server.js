require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const spec = require('./src/openapi');
const routes = require('./src/routes');
const db = require('./src/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.get('/logo.jpeg', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logo.jpeg'));
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
  customSiteTitle: 'Dholera API',
  swaggerOptions: { persistAuthorization: true },
}));

app.use('/api', routes);
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/', (req, res) => res.redirect('/admin'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({ ok: false, message: err.message || 'Server error' });
});

const port = Number(process.env.PORT) || 4000;
db.connect()
  .then(() => {
    app.listen(port, () => {
      console.log('Dholera Dealers Association of India');
      console.log('MongoDB      ' + db.label());
      console.log('API          http://localhost:' + port + '/api/health');
      console.log('Swagger      http://localhost:' + port + '/api-docs');
      console.log('Admin panel  http://localhost:' + port + '/admin');
      console.log('Superadmin   admin@ddaoi.org  /  Admin@123');
      console.log('Demo member  9876543210 or arjun.mehta@example.com  /  Member@123');
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB at ' + db.label());
    console.error(err.message);
    process.exit(1);
  });
