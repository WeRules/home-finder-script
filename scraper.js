require('dotenv').config({
  path: '.env',
});

const path = require('path');
const { writeFileSync, readFileSync } = require('fs');
const puppeteer = require('puppeteer');
const jsdom = require('jsdom');
const { read, utils } = require('xlsx');
const nodeFetch = require('node-fetch');
const nodemailer = require('nodemailer');
const validUrl = require('valid-url');
const { validate: validateEmail } = require('email-validator');

const WIDTH = 1920;
const HEIGHT = 1080;
const TIMEOUT = 10000;

const {
  USER_AGENT,
  EMAIL_USER,
  EMAIL_PASSWORD,
  TELEGRAM_BOT_ID,
  GOOGLE_SPREADSHEET_ID,
  GOOGLE_SPREADSHEET_GID,
} = process.env;

const downloadSpreadsheetFile = async (spreadsheetId, sheetId = 0) => {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${sheetId}`;
  const response = await nodeFetch(url);
  return await response.blob();
};

let data;
try {
  data = readFileSync(path.resolve(__dirname, 'db.json'), { encoding: 'utf8', flag: 'r' });
} catch (e) {
  data = '{}';
}

const pastResults = JSON.parse(data) || [];
// console.log('pastResults:', pastResults);
const results = {};

const runTask = async () => {
  const spreadsheet = await downloadSpreadsheetFile(GOOGLE_SPREADSHEET_ID, GOOGLE_SPREADSHEET_GID);
  const workbook = read(await spreadsheet.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const spreadsheetData = utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });

  const disableds = spreadsheetData.filter((row) => row.disable?.toLowerCase() === 'true').map((row) => row.secret);
  for (const row of spreadsheetData) {
    if (disableds.includes(row.secret)) {
      // TODO clean-up db.json database
      continue;
    }

    await scrape(row.links.split('\n'), row.email, row.secret, row.telegram_group_id);
  }
};

const scrape = async (urls, email, secret, telegramGroupId) => {
  if (!results[email]) {
    results[email] = [];
  }

  if (!pastResults[email]) {
    pastResults[email] = [];
  }

  for (const url of urls) {
    if (validUrl.isUri(url)) {
      await runPuppeteer(url, email);
    }
  }

  // console.log('results:', results);

  if (results[email].length > 0) {
    writeFileSync(
      path.resolve(__dirname, 'db.json'),
      JSON.stringify({
        ...pastResults,
        [email]: [
          ...pastResults[email],
          ...results[email],
        ]
      })
    );
  }

  if (results[email].length > 0) {
    await sendEmail(results[email], email, secret);

    if (TELEGRAM_BOT_ID) {
      await nodeFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_ID}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `New houses found:\n\n${results[email].join('\n')}`,
          "chat_id": telegramGroupId,
          "parse_mode": "markdown",
        }),
      });
    }

    results[email] = [];
    return Promise.resolve();
  }
};

const sendEmail = async (links, email, secret) => {
  if (!validateEmail(email)) {
    return Promise.resolve();
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD
    }
  });

  const htmlTemplate = readFileSync(path.resolve(__dirname, 'template.html'), {encoding: 'utf8', flag: 'r'});
  const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: 'New Houses Found',
    // text: links.join('\n'),
    html: htmlTemplate
      .replace('{{SECRET}}', secret)
      .replace('{{LINKS_LIST}}', links.map((link) => {
        return `<li><a href="${link}">${link}</a></li>`;
      }).join('\n')),
  };

  return transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
};

const runPuppeteer = async (url, email) => {
  // console.log('opening headless browser');
  const browser = await puppeteer.launch({
    headless: true,
    args: [`--window-size=${WIDTH},${HEIGHT}`],
    defaultViewport: {
      width: WIDTH,
      height: HEIGHT,
    },
  });

  const page = await browser.newPage();
  // https://stackoverflow.com/a/51732046/4307769 https://stackoverflow.com/a/68780400/4307769
  await page.setUserAgent(USER_AGENT);

  // console.log('going to website', url);
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForNetworkIdle();

  if (url.includes('funda.nl/')) {
    try {
      // console.log('parsing funda.nl data');
      await page.waitForSelector('.search-result', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);

      dom.window.document
        .querySelectorAll('.search-result')
        ?.forEach((element) => {
          let path = element?.querySelectorAll('a')?.[0]?.href;

          if (!(path.startsWith('http') || path.startsWith('www') || path.startsWith('funda.nl'))) {
            path = `https://www.funda.nl${path}`;
          }

          if (path && !pastResults[email]?.includes(path)) {
            results[email].push(path);
          }
        });
    } catch (e) {
      console.log(e);
    }
  } else if (url.includes('vbo.nl/')) {
    try {
      // console.log('parsing vbo.nl data');
      await page.waitForSelector('#propertiesWrapper', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);

      const result =
        dom.window.document
          .querySelector('#propertiesWrapper')
          ?.querySelector('.row')?.children || [];

      for (const div of result) {
        const anchor = div?.querySelector('a');
        const dateText = anchor?.querySelector('div')?.innerText || anchor?.querySelector('div')?.innerHTML;
        let path = anchor?.href;

        if (!(path.startsWith('http') || path.startsWith('www') || path.startsWith('vbo.nl'))) {
          path = `https://www.vbo.nl${path}`;
        }

        if (
          path &&
          !pastResults[email]?.includes(path) &&
            (dateText?.toLowerCase()?.includes('nieuw') || dateText?.toLowerCase()?.includes('new'))
        ) {
          results[email].push(path);
        }
      }
    } catch (e) {
      console.log(e);
    }
  } else if (url.includes('huislijn.nl/')) {
    try {
      // console.log('parsing huislijn.nl data');
      await page.waitForSelector('.hl-search-object-display', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);
      const result =
        dom.window.document
          .querySelector('.wrapper-objects')
          ?.querySelectorAll('.hl-search-object-display') || [];

      for (const div of result) {
        const anchor = div?.querySelector('a');
        let path = anchor?.href;

        if (!(path.startsWith('http') || path.startsWith('www') || path.startsWith('huislijn.nl'))) {
          path = `https://www.huislijn.nl${path}`;
        }

        if (path && !pastResults[email]?.includes(path)) {
          results[email].push(path);
        }
      }
    } catch (e) {
      console.log(e);
    }
  } else if (url.includes('zah.nl/')) {
    try {
      // console.log('parsing zah.nl data');
      await page.waitForNavigation({
        waitUntil: 'load',
        timeout: TIMEOUT,
      });
      await page.waitForSelector('#koopwoningen', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);
      // writeFileSync(
      //   path.resolve(__dirname, 'test.html'),
      //   htmlString
      // );

      const result =
        dom.window.document
          .querySelector('#koopwoningen')
          ?.querySelectorAll('.result') || [];

      for (const div of result) {
        const anchor = div?.querySelector('a');
        const dateText = div?.querySelector('.date')?.innerText || div?.querySelector('.date')?.innerHTML;
        let path = anchor?.href;

        if (!(path.startsWith('http') || path.startsWith('www') || path.startsWith('zah.nl'))) {
          path = `https://www.zah.nl${path}`;
        }

        if (
          path &&
          !pastResults[email]?.includes(path) &&
          dateText?.toLowerCase().includes('1 dag')
        ) {
          results[email].push(path);
        }
      }
    } catch (e) {
      console.log(e);
    }
  } else if (url.includes('pararius.nl/') || url.includes('pararius.com/')) {
    try {
      // console.log('parsing pararius.nl data');
      await page.waitForSelector('.search-list', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);

      const result =
        dom.window.document
          .querySelector('.search-list')
          ?.querySelectorAll('.search-list__item--listing') || [];

      for (const div of result) {
        const anchor = div?.querySelector('a');
        const dateText = div?.querySelector('.listing-label--new')?.innerText || div?.querySelector('.listing-label--new')?.innerHTML;
        let path = anchor?.href;

        if (!(path.startsWith('http') || path.startsWith('www') || (path.startsWith('pararius.nl') || path.startsWith('pararius.com')))) {
          path = `https://www.pararius.nl${path}`;
        }

        if (
          path &&
          !pastResults[email]?.includes(path) &&
          (dateText?.toLowerCase()?.includes('nieuw') || dateText?.toLowerCase()?.includes('new'))
        ) {
          results[email].push(path);
        }
      }
    } catch (e) {
      console.log(e);
    }
  } else if (url.includes('jaap.nl/')) {
    try {
      // console.log('parsing jaap.nl data');
      await page.waitForSelector('.property-list', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);

      const result =
        dom.window.document
          .querySelector('.property-list')
          ?.querySelectorAll('[id^="house_"]') || [];

      for (const div of result) {
        const anchor = div?.querySelector('a');
        let path = anchor?.href;

        if (!(path.startsWith('http') || path.startsWith('www') || path.startsWith('jaap.nl'))) {
          path = `https://www.jaap.nl${path}`;
        }

        if (path && !pastResults[email]?.includes(path)) {
          results[email].push(path);
        }
      }
    } catch (e) {
      console.log(e);
    }
  } else if (url.includes('hoekstraenvaneck.nl/')) {
    try {
      // console.log('parsing hoekstraenvaneck.nl data');
      await page.waitForSelector('.overzicht', {
        timeout: TIMEOUT,
        visible: true,
      });

      const htmlString = await page.content();
      const dom = new jsdom.JSDOM(htmlString);

      const result =
        dom.window.document
          .querySelector('.overzicht')
          ?.querySelectorAll('.woning') || [];

      for (const div of result) {
        const anchor = div?.querySelector('a');
        let path = anchor?.href;

        if (!(path.startsWith('http') || path.startsWith('www') || path.startsWith('hoekstraenvaneck.nl'))) {
          path = `https://www.hoekstraenvaneck.nl${path}`;
        }

        if (path && !pastResults[email]?.includes(path)) {
          results[email].push(path);
        }
      }
    } catch (e) {
      console.log(e);
    }
  }

  // console.log('closing browser');
  await browser.close();
};

if (
  USER_AGENT
  && EMAIL_USER
  && EMAIL_PASSWORD
  && GOOGLE_SPREADSHEET_ID
  && GOOGLE_SPREADSHEET_GID
) {
  runTask();
} else {
    console.log("You're missing an enviroment key");
}
