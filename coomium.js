const puppeteer = require('puppeteer');
const fs = require('fs');
const cheerio = require('cheerio');
const COOKIE_FILE = 'cookies.json';

let page;

async function launchBrowser() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--enable-features=UseHardwareAcceleration',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    userDataDir: './cache'
  });

  return browser;
}

async function createNewPage(browser) {
  const page = await browser.newPage();
  return page;
}

async function loadCookies() {
  console.log('Loading cookies...');
  const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  await page.setCookie(...cookies);
}

async function saveCookies() {
  console.log('Saving cookies...');
  const cookies = await page.cookies();
  const pB = cookies.find(cookie => cookie.name === 'p-b');
  if (pB) {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify([pB]), 'utf8');
  }
}

async function getTargetUrl() {
  let targetUrl = 'https://poe.com';

  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    const pB = cookies.find(cookie => cookie.name === 'p-b');
    if (pB) {
      targetUrl = 'https://poe.com/claude-instant';
    }
  }

  return targetUrl;
}

async function navigateToTargetUrl(targetUrl) {
  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 0 });
}

async function monitorDOMChanges() {
  await page.exposeFunction('onDOMChange', (changes) => {
    console.log('DOM changes detected:', changes);
  });

  await page.evaluate(() => {
    const observer = new MutationObserver((mutations) => {
      const changes = mutations.map((mutation) => {
        return {
          type: mutation.type,
          target: mutation.target.outerHTML,
          addedNodes: Array.from(mutation.addedNodes).map((node) => node.outerHTML),
          removedNodes: Array.from(mutation.removedNodes).map((node) => node.outerHTML),
        };
      });
      window.onDOMChange(changes);
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  });
}

async function runCoomium() {
  const browser = await launchBrowser();
  page = await createNewPage(browser);

  if (fs.existsSync(COOKIE_FILE)) {
    await loadCookies();
  }

  const targetUrl = await getTargetUrl();
  await navigateToTargetUrl(targetUrl);

  if (!fs.existsSync(COOKIE_FILE)) {
    await saveCookies();
  }

  console.log('Ready to go!');

  page.on('console', message => {
    console.log(`From page: ${message.text()}`);
  });

  await monitorDOMChanges();

  const browserClosePromise = new Promise(resolve => {
    browser.on('disconnected', resolve);
  });

  console.log('Working while the browser is open...');
  await browserClosePromise;
  console.log('Browser closed by the user');
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findFirstMessageElement() {
  const humanMessageSelector = '[class^="Message_humanMessageBubble__"]';
  const botMessageSelector = '[class^="Message_botMessageBubble__"]';

  let messageElementHandle = null;

  const humanMessage = await page.$(humanMessageSelector);
  if (humanMessage) {
    messageElementHandle = humanMessage;
  }

  if (!messageElementHandle) {
    const botMessage = await page.$(botMessageSelector);
    if (botMessage) {
      messageElementHandle = botMessage;
    }
  }

  return messageElementHandle;
}

async function contextMenu() {
const messageElementHandle = await findFirstMessageElement();
if (messageElementHandle) {
  await messageElementHandle.click({ button: 'right' });
  return true;
} else {
  console.log('Элементы для удаления не найдены');
  return false;
}
}

async function del() {
  const contextMenuResult = await contextMenu();
  if (contextMenuResult) {
    const destroy = '[class*="DropdownMenuItem_destructive__"]';
    await page.waitForSelector(destroy);
    await page.click(destroy);
    await page.waitForSelector('label[class^="Checkbox_label__"]');

    const checkboxes = await page.$$('label[class^="Checkbox_label__"]');

    for (let i = 1; i < checkboxes.length; i++) {
      await checkboxes[i].click();
      await delay(500);
    }

    await page.waitForSelector('[class*="ChatPageDeleteFooter_button__"]');
    await page.evaluate(() => {
      const button = document.querySelector('[class*="ChatPageDeleteFooter_button__"]');
      if (button) {
        button.click();
      }
    });

    await page.waitForSelector('[data-variant="danger"][class^="Button_button__"] p');
    await page.evaluate(() => {
      const button = document.querySelector('[data-variant="danger"][class^="Button_button__"] p');
      if (button) {
        button.click();
      }
    });
  } else {
    console.log("пкм не кликнулось");
  }
}

async function pasteAndSend(text) {
  await del();
  await page.waitForTimeout(1000);
  const textareaSelector = 'textarea[class^="ChatMessageInputView_textInput__"]';

  await page.focus(textareaSelector);
  await page.evaluate((textareaSelector, text) => {
    const textarea = document.querySelector(textareaSelector);
    textarea.value = '';
    textarea.value = text;
  }, textareaSelector, text);

  await page.waitForTimeout(500);
  const svgSelector = 'svg[class^="ChatMessageInputView_sendIcon__"]';
  await page.click(svgSelector);
}

async function read() {
  await page.evaluate(() => {
    return new Promise((resolve) => {
      let timeoutId;

      const observer = new MutationObserver(async (mutations) => {
        const childListMutation = mutations.some((mutation) => {
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node.nodeName !== 'SECTION' && node.nodeName !== 'BUTTON') {
                return true;
              }
            }
          }
          return false;
        });

        if (childListMutation) {
          const scrollContainer = document.querySelector('[class^="InfiniteScroll_scrollContainerReverse__"]');
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }

          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
            observer.disconnect();
            resolve();
          }, 5000); // Расчитано под VPN. Если сообщения грузятся быстро, можно немного уменьшить
        }
      });

      observer.observe(document, {
        childList: true,
        subtree: true,
      });
    });
  });

  const content = await page.evaluate(() => {
    const elements = document.querySelectorAll('[class^="Message_botMessageBubble__"]');
    const lastElement = elements[elements.length - 1];
    if (lastElement) {
      const markdownContainer = lastElement.querySelector('[class^="Markdown_markdownContainer__"]');
      return markdownContainer ? markdownContainer.innerHTML : null;
    }
    return null;
  });

  if (content) {
    const formattedMarkdown = convertHtmlToMarkdown(content);
    return formattedMarkdown;
  } else {
    console.log('Элемент "Markdown_markdownContainer__" в элементе "Message_botMessageBubble__" не был найден.');
    return null;
  }
}


function convertHtmlToMarkdown(html) {
const $ = cheerio.load(html);

$('h1').each(function () {
    $(this).replaceWith(`# ${$(this).text()}\n`);
});

$('h2').each(function () {
    $(this).replaceWith(`## ${$(this).text()}\n`);
});

$('h3').each(function () {
    $(this).replaceWith(`### ${$(this).text()}\n`);
});

$('ul li').each(function () {
    $(this).replaceWith(`* ${$(this).text()}\n`);
});

$('ol li').each(function (index) {
    $(this).replaceWith(`${index + 1}. ${$(this).text()}\n`);
});

$('blockquote p').each(function () {
    $(this).replaceWith(`> ${$(this).text()}\n`);
});

$('strong').each(function () {
    $(this).replaceWith(`**${$(this).text()}**`);
});

$('em').each(function () {
    $(this).replaceWith(`*${$(this).text()}*`);
});

$('a').each(function () {
    $(this).replaceWith($(this).text());
});

$('code').each(function () {
    $(this).replaceWith(`\`${$(this).text()}\``);
});

$('p').each(function () {
    $(this).replaceWith(`${$(this).html()}\n`);
});

const markdown = $('body').text().replace(/•/g, '*');
return markdown;
}

module.exports = {
  runCoomium,
  pasteAndSend,
  read,
  delay
};