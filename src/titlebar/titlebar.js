if (process.platform == "win32") {
    var head = document.getElementsByTagName('HEAD')[0];
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = 'titlebar/titlebar.css';
    head.appendChild(link);

    let titlebar = document.createElement('div');
    titlebar.classList.add('titlebar');

    document.body.insertBefore(titlebar, document.body.firstChild);
    let logo = document.createElement('img');
    logo.src = 'titlebar/icon.ico';
    titlebar.appendChild(logo);
    let title = document.createElement('label');
    title.innerText = 'Downloader';
    titlebar.appendChild(title);
    let btn = document.createElement('button');
    btn.id = 'minimize';
    btn.innerText = '-';
    titlebar.appendChild(btn);
    btn = document.createElement('button');
    btn.id = 'maximize';
    btn.innerText = '_';
    titlebar.appendChild(btn);
    btn = document.createElement('button');
    btn.id = 'close';
    btn.classList.add('appquit');
    btn.innerText = 'X';
    titlebar.appendChild(btn);
    document.querySelector(".titlebar").style.height = 'auto';
    document.querySelector("#minimize").addEventListener('click', (e) => {

        console.log('sending');
        const {
            ipcRenderer
        } = require('electron');
        ipcRenderer.send('minimize', null);
        console.log("sent");
    });
    document.querySelector("#maximize").addEventListener('click', (e) => {

        console.log('sending');
        const {
            ipcRenderer
        } = require('electron');
        ipcRenderer.send('maximize', null);
        console.log("sent");
    });
    document.querySelector("#close").addEventListener('click', (e) => {

        console.log('sending');
        const {
            ipcRenderer
        } = require('electron');
        ipcRenderer.send('quit', null);
        console.log("sent");
    });

}