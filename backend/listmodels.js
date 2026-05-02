require('dotenv').config();
const https = require('https');

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    json.models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .forEach(m => console.log(m.name));
  });
});m 