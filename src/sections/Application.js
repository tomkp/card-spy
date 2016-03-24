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

        ipc.on('device-activated', function(event, {reader}) {
            console.log(`* Device activated '${reader.name}'`);
        });
        ipc.on('device-deactivated', function(event, {reader}) {
            console.log(`* Device deactivated '${reader.name}'`);
        });
        ipc.on('card-inserted', (event, {reader, status}) => {
            console.log(`* Card inserted into '${reader.name}', atr: '${status.atr.toString('hex')}'`);
            this.setState({
                status: status,
                reader: reader
            });
        });
        ipc.on('card-removed', function(event, message) {
            console.log(`* Card removed`);
        });
        ipc.on('command-issued', function(event, {reader, command}) {
            console.log(`* Command issued '${command}'`);
        });
        ipc.on('response-received', function(event, {reader, response, command}) {
            console.log(`* Response received '${command}' -> '${response}'`);
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
