import React from 'react';
import './application.scss';

import {Layout, Fixed, Flex} from 'react-layout-pane';
import StatusBar from './status-bar/StatusBar';
import electron from 'electron';
const ipc = electron.ipcRenderer;


class Application extends React.Component {

    constructor(props) {
        super(props);
        
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
                //device: device,
                card: atr
            });
        });
        ipc.on('card-removed', (event, {name}) => {
            console.log(`* Card removed from '${name}' `);

            this.setState({
                card: null,
                current: null,
                applications: []
            });
        });
        ipc.on('command-issued', (event, {atr, command}) => {
            console.log(`* Command '${command}' issued to '${atr}' `);
        });
        ipc.on('response-received', (event, {atr, command, response, ok, meaning}) => {
            console.log(`* Response '${response}' received from '${atr}' in response to '${command}'`);

            let log = this.state.log;
            log.push({
                command: command,
                response: response,
                ok: ok,
                meaning: meaning
            });

            let current = this.state.current;
            let newApplications = [...this.state.applications];

            console.log(`\tCurrent application ${current}`);

            this.setState({
                log: log,
                applications: newApplications
            });


        });
        ipc.on('applications-found', (event, {ids}) => {
            console.log(`* Applications found '${ids}'`);
            this.setState({
                ids: ids
            })
        });

        ipc.on('application-selected', (event, {application}) => {
            console.log(`* Application Selected ${application}`);
            let newApplications = [...this.state.applications, {name: application, children: []}];
            this.setState({
                current: application,
                applications: newApplications
            });
        });


        ipc.on('error', (event, message) => {
            console.log(event, message);
        });

        this.state = {
            device: null,
            card: null,
            ids: [],
            log: [],
            current: null,
            applications: []
        };
    }


    clearLog() {
        this.setState({
           log: []
        });
    }

    clearRepl() {
        this.setState({
            repl: ''
        });
    }

    replKeyUp(e) {
        if (e.keyCode === 13 && this.state.repl.length > 0) {
            ipc.send('repl', this.state.repl);
        }
    }

    replChange(e) {
        var value = e.target.value;
        this.setState({
           repl: value
        });
    }

    interrogate() {
        ipc.send('interrogate', {});
    }

    replRun() {
        ipc.send('repl', this.state.repl);
    }

    render() {
        //console.log(`Application.state: ${JSON.stringify(this.state)}`);
        return (
            <Layout type="column">
                <Flex className="application">
                    {this.props.children &&
                    React.cloneElement(this.props.children, {
                        log: this.state.log,
                        ids: this.state.ids,
                        interrogate: () => {this.interrogate()},
                        clearLog: () => {this.clearLog()},
                        repl: this.state.repl,
                        clearRepl: () => {this.clearRepl()},
                        replChange: (e) => {this.replChange(e)},
                        replKeyUp: (e) => {this.replKeyUp(e)},
                        replRun: () => this.replRun(),
                        current: this.state.current,
                        applications: this.state.applications
                    })
                    }
                </Flex>
                <StatusBar device={this.state.device} card={this.state.card} />
            </Layout>

        );
    }
}

export default Application;
