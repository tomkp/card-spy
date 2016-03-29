import React from 'react';
import './application.scss';

import {Layout, Fixed, Flex} from 'react-layout-pane';

import Header from './header/Header';
import Footer from './footer/Footer';
import Commands from './results/Commands';
import Sidebar from './sidebar/Sidebar';


import electron from 'electron';




class Application extends React.Component {

    constructor(props) {
        super(props);
        
        const ipc = electron.ipcRenderer;

        ipc.on('device-activated', (event, {device, devices}) => {
            console.log(`* Device '${device.name}' activated, devices: [${devices}]`);
            this.setState({
                device: device
            });
        });
        ipc.on('device-deactivated', (event, {device, devices}) => {
            console.log(`* Device '${device.name}' deactivated, devices: ${devices}`);
            
            this.setState({
                device: null
            });
        });
        ipc.on('card-inserted', (event, {atr, device}) => {
            console.log(`* Card '${atr}' inserted into '${device}'`);

            this.setState({
                device: device,
                card: atr
            });
        });
        ipc.on('card-removed', (event, {name}) => {
            console.log(`* Card removed from '${name}' `);

            this.setState({
                card: null
            });
        });
        ipc.on('command-issued', (event, {atr, command}) => {
            console.log(`* Command '${command}' issued to '${atr}' `);
        });
        ipc.on('response-received', (event, {atr, command, response, ok, meaning}) => {
            console.log(`* Response '${response}' received from '${atr}' in response to '${command}'`);

            let commands = this.state.commands;
            commands.push({
                command: command,
                response: response,
                ok: ok,
                meaning: meaning
            });
            this.setState({
                commands: commands
            })
        });
        ipc.on('applications-found', (event, {ids}) => {
            console.log(`* Applications found '${ids}'`);
            this.setState({
                ids: ids
            })
        });

        ipc.on('application-selected', (event, {command, response}) => {
            console.log(`* Application Selected ${command} ${response}`);
        });


        ipc.on('error', (event, message) => {
            console.log(event, message);
        });

        this.state = {
            device: null,
            card: null,
            ids: [],
            commands: []
        };
    }


    clear() {
        this.setState({
           commands: []
        });
    }

    render() {
        //console.log(`Application.state: ${JSON.stringify(this.state)}`);
        return (
            <Layout type="column">
                <Flex className="application">
                    {this.props.children &&
                    React.cloneElement(this.props.children, { commands: this.state.commands, ids: this.state.ids, clear: () => {this.clear()}})
                    }
                </Flex>
                <Fixed>
                    <Footer device={this.state.device}
                            card={this.state.card} />
                </Fixed>
            </Layout>

        );
    }
}

export default Application;
