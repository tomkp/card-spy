'use strict';



const electron = require('electron');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 1200, height: 600});

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/dist/index.html');

    // Open the DevTools.
    let webContents = mainWindow.webContents;

    webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });


    webContents.on('did-finish-load', function () {


        setTimeout(function () {

            var cardreader = require('card-reader');
            var iso7816 = require('iso7816');


            cardreader.on('device-activated', function (reader) {
                console.log(`# Device '${reader.name}' activated`);
                webContents.send('device-activated', {reader});
            });

            cardreader.on('device-deactivated', function (reader) {
                console.log(`# Device '${reader.name}' deactivated`);
                webContents.send('device-deactivated', {reader});
            });

            cardreader.on('card-removed', function (reader) {
                console.log(`# Card removed from '${reader.name}' `);
                webContents.send('card-removed', {reader});
            });

            cardreader.on('command-issued', function (reader, command) {
                console.log(`# Command '${command.toString('hex')}' issued to '${reader.name}' `);
                webContents.send('command-issued', {reader, command});
            });

            cardreader.on('response-received', function (reader, response, command) {
                console.log(`# Response '${response}' received from '${reader.name}' in response to '${command}'`);
                webContents.send('response-received', {reader, response, command});
            });


            cardreader.on('card-inserted', function (reader, status) {

                console.log(`# Card inserted into '${reader.name}', atr: '${status.atr.toString('hex')}'`);

                webContents.send('card-inserted', {reader, status});

                let application = iso7816(cardreader);
                application
                    .selectFile([0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31])
                    .then(function (response) {
                        console.log(`# Select PSE Response: '${response}'`);
                    }).catch(function (error) {
                        console.log('# Error:', error, error.stack);
                    });


            });
        }, 500);
    });


}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});