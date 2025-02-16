const fs = require('fs');
const path = require('path');

const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');
var readline = require('readline');

/**
 * Read URL as HTML string
 * @param {string} url
 * @returns Promise<string>
 */
const requestHtmlText = (url) => {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((response) => response.text())
      .then(resolve)
      .catch(reject);
  });
};

const FAILED_TO_EXTRACT_XML_URL_ERROR = new Error(
  'Failed to extract xml playlist location.',
);

const getTracks = async (nhaccuatuiYUrl) => {
  const htmlText = await requestHtmlText(nhaccuatuiYUrl);
  const regex = /player\.peConfig\.xmlURL\s=\s"(?<xmlUrl>.+)";/;
  const match = regex.exec(htmlText);
  if (!match) {
    throw FAILED_TO_EXTRACT_XML_URL_ERROR;
  }

  const xmlUrl = match.groups.xmlUrl;
  if (!xmlUrl) {
    throw FAILED_TO_EXTRACT_XML_URL_ERROR;
  }

  const xmlText = await requestHtmlText(xmlUrl);
  const parsedXmlObj = await parseStringPromise(xmlText);
  const tracks = parsedXmlObj.tracklist.track || [];

  return tracks
    .map((track) => {
      const title = track.title[0].trim();
      const url = track.location[0].trim();
      const fileNameReg = /(?<fileName>[\w-\d]+\.mp3)/;
      const match = fileNameReg.exec(url);
      if (!match) return null;

      const { fileName = `${title}.mp3` } = match.groups;
      return {
        fileName,
        title,
        url,
      };
    })
    .filter(Boolean);
};

async function exists(path) {
  try {
    await fs.promises.access(path);
    return true;
  } catch (e) {
    return false;
  }
}

const stdoutLogging = (input) => {
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(input);
};

const download = async (track, folderPath) => {
  try {
    const absolutePath = path.resolve(folderPath);
    const isExisted = await exists(absolutePath);
    if (!isExisted) {
      await new Promise((resolve, reject) => {
        fs.mkdir(absolutePath, { recursive: true }, (err, path) => {
          if (!err) {
            resolve();
          } else {
            reject(new Error(`Failed to create directory ${path}`));
          }
        });
      });
    }

    const response = await fetch(track.url);
    const fileStream = fs.createWriteStream(
      path.resolve(absolutePath, track.fileName),
    );

    await new Promise((resolve, reject) => {
      const contentLength = +response.headers.get('Content-Length');
      let totalReceivedLength = 0;

      response.body.pipe(fileStream);
      response.body.on('error', reject);
      response.body.on('data', (data) => {
        totalReceivedLength += data.length;
        const percent = Math.round((totalReceivedLength / contentLength) * 100);
        stdoutLogging(
          `Downloading file ${JSON.stringify(track.fileName)}...${percent}%`,
        );
      });
      fileStream.on('finish', () => {
        // eslint-disable-next-line no-console
        console.info(`\nDownloaded file ${JSON.stringify(track.fileName)}!`);
        resolve();
      });
    });

    return true;
  } catch (error) {
    throw new Error('Fail to download.');
  }
};

const runPromiseSequentially = (iterator, promiseCreator, ...params) => {
  return iterator.reduce(
    (prevPromise, item) =>
      // eslint-disable-next-line no-useless-call
      prevPromise.then((_) => promiseCreator.apply(null, [item, ...params])),
    Promise.resolve(),
  );
};

module.exports = {
  getTracks,
  runPromiseSequentially,
  download,
};
