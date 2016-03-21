import React from 'react';
import './application.scss';

import Header from './header/Header';
import Footer from './footer/Footer';
import Results from './results/Results';
import Sidebar from './sidebar/Sidebar';


import electron from 'electron';




class Application extends React.Component {

    constructor(props) {
        super(props);
        
        const ipc = electron.ipcRenderer;
        
        ipc.on('test', function(event, message) {
            console.log(event, message);
        });
        ipc.on('device-activated', function(event, message) {
            console.log(event, message);
        });
        ipc.on('device-deactivated', function(event, message) {
            console.log(event, message);
        });
        ipc.on('card-inserted', (event, {reader, status}) => {
            console.log(`Card inserted into '${reader.name}', atr: '${status.atr.toString('hex')}'`);
            this.setState({
                status: status,
                reader: reader
            });
        });
        ipc.on('card-removed', function(event, message) {
            console.log(event, message);
        });
        ipc.on('command-issued', function(event, message) {
            console.log(event, message);
        });
        ipc.on('response-received', function(event, message) {
            console.log(event, message);
        });
        ipc.on('error', function(event, message) {
            console.log(event, message);
        });

        this.state = {
            status: null,
            reader: null
        };
    }

    render() {
        return (
            <div className="column application">
                <div className="flex"> </div>
                <Footer reader={this.state.reader} status={this.state.status}/>
            </div>
        );
    }
}

export default Application;
