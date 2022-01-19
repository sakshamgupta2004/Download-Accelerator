const electron = require('electron');
const fs = require('fs');
const { OutgoingMessage } = require('http');
const request = require('request');
const { app, BrowserWindow, Menu, ipcMain } = electron;
var mainwindow;
app.on('ready', () => {
    mainwindow = new BrowserWindow({
        //title: 'Sugarsnooper',
        //width: 500,
        //height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        alwaysOnTop: true
        //frame: process.platform == "win32" ? false : true
    });
    //mainwindow.loadURL('http://www.sugarsnooper.com/Default.aspx');
    mainwindow.loadFile('home.html');
    //mainwindow.resizable = false;
    //Menu.setApplicationMenu(null);
});





var cancelDownload = false;
const getDownloadSizeAndCheckIfSupportsRange = function (url, successfullCallback, failedCallback) {
    var req = request({
        method: 'GET',
        uri: url
    });
    req.on('response', function (data) {
        req.abort();
        if (data.statusCode == 200) {
            successfullCallback(data.headers['content-length'], data.headers['accept-ranges'] == 'bytes');
        }
        else {
            failedCallback(data.statusCode);
        }
    });
    req.on('error', function (e) {
        if (e.message != 'aborted')
            failedCallback(e.message);
    });

};
const download = function (theUrl, filename, successfullCallback, failedCallback, progressCallback, rangeStart = 0, rangeEnd = 0, cancelFlag = [false]) {
    let file_url = theUrl;
    let out = fs.createWriteStream(filename + '_tempDownloaderDownload');
    let total = 0;
    let downloaded = 0;

    let req;
    if (rangeStart == 0 && rangeEnd == 0) {
        req = request({
            method: 'GET',
            uri: file_url
        });
    }
    else {
        req = request({
            method: 'GET',
            uri: file_url,
            headers: {
                'Range': 'bytes=' + rangeStart + '-' + rangeEnd
            }
        });
    }

    req.pipe(out);

    req.on('response', function (data) {
        total = data.headers['content-length'];
        if (!(data.statusCode == 200 || data.statusCode == 206)) {
            req.abort();
        }
    });

    req.on('data', function (chunk) {
        downloaded += chunk.length;
        progressCallback(chunk.length, total);
        if (cancelFlag[0] || cancelDownload) {
            req.abort();
        }
    });

    req.on('end', function () {
        try {
            out.close();
        }
        catch (e) { }

        if (downloaded == total) {
            if (fs.existsSync(filename)) {
                fs.rmSync(filename);
            }
            fs.renameSync(filename + "_tempDownloaderDownload", filename);
            successfullCallback();
        }
        else {
            if (fs.existsSync(filename + "_tempDownloaderDownload")) {
                fs.rmSync(filename + "_tempDownloaderDownload");
            }
            failedCallback("Unequal Output");
        }
    });

    req.on('error', function (e) {
        if (fs.existsSync(filename + "_tempDownloaderDownload")) {
            fs.rmSync(filename + "_tempDownloaderDownload");
        }
        if (e.message != 'aborted')
            failedCallback(e.message);
    });
};
const singleThreadDownload = (event, url, filename) => {
    let totalDownloaded = 0;
    download(
        url,
        filename,
        () => {
            event.reply('completed', null);
        },
        (status) => {
            if (fs.existsSync(filename)) {
                fs.rmSync(filename);
            }
            event.reply('failed', status);
        },
        (received, total) => {
            totalDownloaded += received;
            event.reply('part-progress', totalDownloaded, total, 0);
            event.reply('progress', totalDownloaded, total);
        }
    );
};
const multiThreadDownload = (event, url, filename, length, threads) => {

    const copyParts = (out, k, doneCallback) => {
        let inFile = fs.createReadStream(filename + "_PART_" + k);
        inFile.pipe(out, { end: false });
        inFile.on('end', () => {
            inFile.close();
            fs.rmSync(filename + "_PART_" + k);
            k += 1;
            if (k == threads) {
                doneCallback();
            }
            else {
                copyParts(out, k, doneCallback);
            }
        });
    };


    partRanges = [];
    partsDone = [];
    partDownloaded = [];
    anyPartFailed = false;
    cancelFlags = [];
    totalDownloaded = 0;
    for (let i = 0; i < threads; i++) {
        let start = Math.trunc(Math.trunc(length * i) / threads);
        let end = Math.trunc(Math.trunc(length * (i + 1)) / threads) - 1;
        partRanges[i] = [start, end];
        partsDone[i] = false;
        cancelFlags[i] = false;
        partDownloaded[i] = 0;
    }

    for (let i = 0; i < threads; i++) {
        let j = i;
        download(
            url,
            filename + "_PART_" + i,
            () => {
                if (!anyPartFailed) {
                    partsDone[j] = true;
                    let areAllPartsDone = true;
                    for (let k = 0; k < threads; k++) {
                        areAllPartsDone &= partsDone[k];
                    }
                    if (areAllPartsDone) {
                        event.reply('merging', null);
                        let out = fs.createWriteStream(filename);
                        copyParts(out, 0, () => {
                            out.close();
                            event.reply('completed', null);
                        });
                    }
                }
                else {
                    fs.rmSync(filename + "_PART_" + j);
                }
            },
            (error) => {
                anyPartFailed = true;
                for (let k = 0; k < threads; k++) {
                    if (k != j)
                        cancelFlags[k] = true;
                }
                event.reply('failed', error);
            },
            (downloaded, total) => {
                totalDownloaded += downloaded;
                partDownloaded[j] += downloaded;
                event.reply('part-progress', partDownloaded[j], total, j);
                event.reply('progress', totalDownloaded, length);
            },
            partRanges[i][0],
            partRanges[i][1],
            [cancelFlags[j]]
        );
    }


};

ipcMain.on('download-start', (event, url, filename, threads) => {

    cancelDownload = false;
    if (threads > 1) {
        getDownloadSizeAndCheckIfSupportsRange(
            url,
            (length, acceptsRanges) => {
                if (length == 0) {
                    singleThreadDownload(event, url, filename);
                }
                else {
                    if (!acceptsRanges) {
                        singleThreadDownload(event, url, filename);
                    }
                    else {
                        multiThreadDownload(event, url, filename, length, threads);
                    }
                }
            },
            (error) => {
                event.reply('failed', error);
            }
        );
    }
    else {
        singleThreadDownload(event, url, filename);
    }
});

ipcMain.on('cancel-download', (event, args) => {
cancelDownload = true;
event.reply('failed', "Cancelled");
});