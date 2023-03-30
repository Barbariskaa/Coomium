const express = require('express');
const { runCoomium, pasteAndSend, read, delay } = require('./coomium');
const app = express();
app.use(express.json());

const fs = require('fs');

const YOUR_NAME = 'you'
const CHARACTER = 'character';

let prompt = '';

fs.readFile('prompt.txt', 'utf8', (err, data) => {
  
  if (err) {
    console.error('Промпта нет. Добавь prompt.txt с текстом в папку', err);
  } else {
    prompt = data+"\n\n";
    prompt = prompt.replace(/{{user}}/g, YOUR_NAME).replace(/{{char}}/g, CHARACTER);
    console.log('Промпт загружен и обработан');
  }
});

async function initPuppeteer() {
    try {
      await runCoomium();
    } catch (error) {
      console.error('Error in initializing Puppeteer:', error);
    }
  }

  app.use(async (req, res, next) => {
    if (req.method === 'GET') {
      res.json({ result: "CoomLoud & instant" });
    } else {
      try {
        console.log('Calling pasteAndSend with:', req.body.prompt);
        console.log('\n\n\n\n\nRequest method:', req.method,'\n\n\n\n\nRequest body:', req.body);
        await pasteAndSend(prompt+req.body.prompt);
        await delay(2000);
        const result = await read();
        console.log("\n\n\n\n",result,"\n\n\n\n")
        res.json({
          results: [{ text: result }],
        });
      } catch (error) {
        console.error('Error in generate:', error);
        res.status(504).json({ error: 'An error occurred while generating the response.' });
      }
    }
  });

const port = 5004;
const host = '127.0.0.1';
app.listen(port, host, async () => {
  console.log(`Coomium-poe is running on http://${host}:${port}/api`);
  await initPuppeteer();
});
