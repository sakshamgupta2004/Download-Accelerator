const { webContents } = require('electron');
const electron = require('electron');
const fs = require('fs');
const path = require('path');
const request = require('request');
const { app, BrowserWindow, Menu, ipcMain, shell, dialog, session, MenuItem } = electron;
var mainwindow;
var allowedToExit = true;
var saveLocation = null;
var savedUrl = null;
var savedFileName = null;
var cookiesMain = null;
var lastUrl = '',
    ecode = '',
    edesc = '';
var titlebarEvent = null;
const iconPath = process.platform !== 'darwin' ?
    'src/icons/app.ico' :
    'src/icons/app.icns';
fs.mkdirSync(path.join(__dirname, 'src/icons'), { recursive: true });
const icongen = require('icon-gen');
icongen(path.join(__dirname, 'src/titlebar/icon.png'), path.join(__dirname, 'src/icons'), { report: true })
    .then((results) => {
        try {
            fs.copyFile(path.join(__dirname, 'src/icons/app.ico'), path.join(__dirname, 'src/icons/icon.ico'), (e) => {
                console.log(e);
            });
            fs.copyFile(path.join(__dirname, 'src/icons/app.icns'), path.join(__dirname, 'src/icons/icon.icns'), (e) => {
                console.log(e);
            });
        } catch (e) {
            console.log(e);
        }
    })
    .catch((err) => {
        console.error(err)
    });
app.on('ready', () => {
    mainwindow = new BrowserWindow({
        //title: 'Sugarsnooper',
        //width: 500,
        //height: 800,
        minHeight: 300,
        minWidth: 500,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            preload: path.join(__dirname, 'src/js/preload.js')
        },
        //alwaysOnTop: true
        frame: process.platform != "win32",
        icon: path.join(__dirname, iconPath)
    });
    mainwindow.webContents.on('did-start-loading', (e, i) => {

        mainwindow.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'src/titlebar/titlebar.js')));
    });
    mainwindow.on('close', (e) => {
        if (!allowedToExit)
            e.preventDefault();
    });
    mainwindow.on('maximize', (event) => {
        try {
            titlebarEvent.reply('maximize', null);
        } catch (e) {

        }
    });
    mainwindow.on('unmaximize', (event) => {
        try {
            titlebarEvent.reply('unmaximize', null);
        } catch (e) {

        }
    });


    mainwindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url == "about:blank") {
            return {
                action: 'allow'
            }
        } else {
            mainwindow.webContents.loadURL(url);
            return {
                action: 'deny'
            }
        }
    });
    mainwindow.webContents.session.on('will-download', (event, item, webContents) => {
        event.preventDefault();
        if (allowedToExit) {
            savedUrl = item.getURL();
            savedFileName = item.getFilename();
            var domain = new URL(item.getURL()).hostname;
            console.log(domain);
            mainwindow.loadFile('src/download.html');
            cookiesMain = "";

            session.defaultSession.cookies.get({})
                .then((cookies) => {
                    cookies.forEach((item) => {
                        if (domain.includes(item['domain']) || (!item['hostOnly']))
                            cookiesMain += item['name'] + '=' + item['value'] + ";";
                    });
                }).catch((error) => {
                    console.log(error)
                });
        } else {
            dialog.showMessageBox(mainwindow, {
                label: "Can't download",
                message: "Another download is running. Please wait"
            });
        }

    });

    var menu = new Menu();
    menu.append(new MenuItem({
        label: 'Download File',
        click: () => {

            if (allowedToExit) {
                savedUrl = mainwindow.webContents.getURL();
                savedFileName = decodeURIComponent(savedUrl.split('/').pop().split('#')[0].split('?')[0]);
                var domain = new URL(savedUrl).hostname;
                console.log(domain);
                mainwindow.loadFile('src/download.html');
                cookiesMain = "";
                session.defaultSession.cookies.get({})
                    .then((cookies) => {
                        cookies.forEach((item) => {
                            if (domain.includes(item['domain']) || (!item['hostOnly']))
                                cookiesMain += item['name'] + '=' + item['value'] + ";";
                        });
                    }).catch((error) => {
                        console.log(error)
                    });
            } else {
                dialog.showMessageBox(mainwindow, {
                    label: "Can't download",
                    message: "Another download is running. Please wait"
                });
            }
        }
    }));

    mainwindow.webContents.on("context-menu", (event, click) => {
        event.preventDefault();
        if (!mainwindow.webContents.getURL().startsWith("file:///"))
            menu.popup(mainwindow.webContents);
    }, false);
    mainwindow.webContents.on('did-fail-load', (e, errorcode, errordesc, url) => {
        mainwindow.loadFile('src/noConnection.html');
        lastUrl = url;
        ecode = errorcode;
        edesc = errordesc;
    });

    // savedUrl = 'https://speed.hetzner.de/100MB.bin';
    // savedFileName = '100mb.bin';
    // cookiesMain = '';
    // mainwindow.loadFile('src/download.html');

    mainwindow.loadFile('src/home.html');
    // Menu.setApplicationMenu(null);
});


var cancelDownload = false;
const getDownloadLocation = function() {
    if (saveLocation == null)
        return app.getPath("downloads");
    else
        return saveLocation;
}
const getFileNameWithoutExtAndExt = function(filename = "") {
    let name = filename;
    let path = '';
    let ext = '';
    if (filename.includes('/')) {
        name = filename.substring(filename.lastIndexOf('/') + 1);
        path = filename.substring(0, filename.lastIndexOf('/') + 1);
    }

    if (name.includes('.')) {
        ext = name.substring(name.lastIndexOf('.') + 1);
        name = name.substring(0, name.lastIndexOf('.'));
    }
    return [path + name, ext];
};

const generateUniqueName = function(filename, tries = 0) {

    if (!fs.existsSync(filename)) {
        return filename;
    }
    nameAndExt = getFileNameWithoutExtAndExt(filename);
    let name = nameAndExt[0];
    if (tries != 0) {
        name = name.substring(0, name.lastIndexOf("("));
    }
    return generateUniqueName(name + "(" + (tries + 1) + ")." + nameAndExt[1], tries + 1);
};
const getDownloadSizeAndCheckIfSupportsRange = function(url, successfullCallback, failedCallback) {

    var req = request({
        method: 'GET',
        uri: url,
        headers: {
            'Cookie': cookiesMain
        }
    });
    req.on('response', function(data) {
        req.abort();
        if (data.statusCode == 200) {
            //console.log(data.headers['content-disposition']);
            successfullCallback(data.headers['content-length'], data.headers['accept-ranges'] == 'bytes');
        } else {
            failedCallback(data.statusCode);
        }
    });
    req.on('error', function(e) {
        if (e.message != 'aborted')
            failedCallback(e.message);
    });

};
const download = function(theUrl, filename, successfullCallback, failedCallback, progressCallback, rangeStart = 0, rangeEnd = 0, cancelFlag = [false]) {
    let file_url = theUrl;
    console.log(filename);
    let out = fs.createWriteStream(filename + '_tempDownloaderDownload');
    let total = 0;
    let downloaded = 0;

    let req;
    if (rangeStart == 0 && rangeEnd == 0) {
        req = request({
            method: 'GET',
            uri: file_url,
            headers: {
                'Cookie': cookiesMain
            }
        });
    } else {
        req = request({
            method: 'GET',
            uri: file_url,
            headers: {
                'Range': 'bytes=' + rangeStart + '-' + rangeEnd,
                'Cookie': cookiesMain
            }
        });
    }

    req.pipe(out);

    req.on('response', function(data) {
        total = data.headers['content-length'];
        if (typeof total === 'undefined')
            total = 0;
        if (!(data.statusCode == 200 || data.statusCode == 206)) {
            req.abort();
        }
    });

    req.on('data', function(chunk) {
        downloaded += chunk.length;
        progressCallback(chunk.length, total);
        if (cancelFlag[0] || cancelDownload) {
            req.abort();
        }
    });

    req.on('end', function() {
        try {
            out.close();
        } catch (e) {}

        if (downloaded == total || total == 0) {
            if (fs.existsSync(filename)) {
                fs.rmSync(filename);
            }
            fs.renameSync(filename + "_tempDownloaderDownload", filename);
            successfullCallback();
        } else {
            if (fs.existsSync(filename + "_tempDownloaderDownload")) {
                fs.rmSync(filename + "_tempDownloaderDownload");
            }
            console.log(typeof total);
            failedCallback("Unequal Output");
        }
    });

    req.on('error', function(e) {
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
            allowedToExit = true;
        },
        (status) => {
            console.log(status);
            if (fs.existsSync(filename)) {
                fs.rmSync(filename);
            }
            event.reply('failed', status);
            allowedToExit = true;
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
            } else {
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
                    event.reply('part-complete', j);
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
                            allowedToExit = true;
                        });
                    }
                } else {
                    fs.rmSync(filename + "_PART_" + j);
                }
            },
            (error) => {
                anyPartFailed = true;
                for (let k = 0; k < threads; k++) {
                    if (k != j)
                        cancelFlags[k] = true;

                    if (fs.existsSync(filename + "_PART_" + k)) {
                        try {
                            fs.rmSync(filename + "_PART_" + k);
                        } catch (e) {

                        }
                    }
                }
                event.reply('failed', error);
                allowedToExit = true;
            },
            (downloaded, total) => {
                totalDownloaded += downloaded;
                partDownloaded[j] += downloaded;
                event.reply('part-progress', partDownloaded[j], total, j);
                event.reply('progress', totalDownloaded, length);
            },
            partRanges[i][0],
            partRanges[i][1], [cancelFlags[j]]
        );
    }


};
let fn = '';
ipcMain.on('download-start', (event, url, filename, threads) => {

    allowedToExit = false;
    filename = path.join(getDownloadLocation(), filename);
    filename = generateUniqueName(filename);
    fn = filename;
    cancelDownload = false;
    if (threads > 1) {
        getDownloadSizeAndCheckIfSupportsRange(
            url,
            (length, acceptsRanges) => {
                if (length == 0 || typeof length === 'undefined') {
                    singleThreadDownload(event, url, filename);
                    event.reply('rangenotsupport', null);
                } else {
                    if (!acceptsRanges) {
                        singleThreadDownload(event, url, filename);
                        event.reply('rangenotsupport', null);
                    } else {

                        if (Number.parseInt(length) <= Number.parseInt(threads)) {
                            threads = Math.trunc(length / 2);

                            if (threads < 1) {
                                threads = 1;
                            }
                            event.reply('maxthreads', threads);
                        }
                        if (threads == 1) {
                            singleThreadDownload(event, url, filename);
                            event.reply('rangenotsupport', null);
                        } else {
                            multiThreadDownload(event, url, filename, length, threads);

                        }
                    }
                }
            },
            (error) => {
                console.log(error);
                event.reply('failed', error);
                allowedToExit = true;
            }
        );
    } else {
        singleThreadDownload(event, url, filename);
    }
});

ipcMain.on('cancel-download', (event, args) => {
    cancelDownload = true;
    event.reply('failed', "Cancelled");
});
ipcMain.on('openContainingFolder', (event, args) => {
    shell.openPath(getDownloadLocation());
});
ipcMain.on('showInExplorer', (event, args) => {
    shell.showItemInFolder(fn);
});
ipcMain.on('openLocationSelector', (event, args) => {
    try {
        saveLocation = dialog.showOpenDialogSync(mainwindow, { properties: ['openDirectory'] })[0];
    } catch {

    }
    event.returnValue = saveLocation;
});
ipcMain.on('getSaveLocation', (event, args) => {
    event.returnValue = getDownloadLocation();
});
ipcMain.on('resetSaveLocation', (event, args) => {
    saveLocation = null;
    event.returnValue = 'done';
});
ipcMain.on('getSavedUrlAndFileName', (event, args) => {
    event.returnValue = [savedUrl, savedFileName];
});
ipcMain.on('quit', (event) => {
    if (allowedToExit)
        app.quit();
    else
        dialog.showMessageBox(mainwindow, { title: 'Downloader', message: 'Please wait for the download to finish' });
    //mainwindow.minimize();
});
ipcMain.on('minimize', (event, args) => {
    mainwindow.minimize();
});
ipcMain.on('maximize', (event, args) => {
    if (mainwindow.isMaximized()) {
        mainwindow.unmaximize();
        event.returnValue = false;
    } else {
        mainwindow.maximize();
        event.returnValue = true;
    }
});
ipcMain.on('ismaximized', (event) => {
    titlebarEvent = event;
    event.returnValue = mainwindow.isMaximized();
});
ipcMain.on('getDir', (event, args) => {
    event.returnValue = __dirname;
});
ipcMain.on('getfailedurl', (e) => {
    e.returnValue = lastUrl;
});
ipcMain.on('geterrorcode', (e) => {
    e.returnValue = ecode;
});
ipcMain.on('geterrordesc', (e) => {
    e.returnValue = edesc;
});