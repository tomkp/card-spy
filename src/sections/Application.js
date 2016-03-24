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

        ipc.on('device-activated', (event, {reader}) => {
            console.log(`* Device activated '${reader.name}'`);
            this.setState({
                deviceStatus: 'activated'
            });
        });
        ipc.on('device-deactivated', (event, {reader}) => {
            console.log(`* Device deactivated '${reader.name}'`);
            this.setState({
                deviceStatus: 'deactivated'
            });
        });
        ipc.on('card-inserted', (event, {reader, status}) => {
            console.log(`* Card inserted into '${reader.name}', atr: '${status.atr.toString('hex')}'`);
            this.setState({
                status: status,
                reader: reader,
                cardStatus: 'inserted'
            });
        });
        ipc.on('card-removed', (event, message) => {
            console.log(`* Card removed`);
            this.setState({
                cardStatus: 'removed'
            });
        });
        ipc.on('command-issued', (event, {reader, command}) => {
            console.log(`* Command issued '${command}'`);
        });
        ipc.on('response-received', (event, {reader, response, command}) => {
            console.log(`* Response received '${command}' -> '${response}'`);
        });
        ipc.on('error', (event, message) => {
            console.log(event, message);
        });

        this.state = {
            status: null,
            reader: null,
            deviceStatus: 'unknown',
            cardStatus: 'unknown'
        };
    }

    render() {
        return (
            <div className="column application">
                <div className="flex"> </div>
                <Footer reader={this.state.reader}
                        atr={this.state.status?this.state.status.atr:''}
                        deviceStatus={this.state.deviceStatus}
                        cardStatus={this.state.cardStatus} />
            </div>
        );
    }
}

export default Application;
