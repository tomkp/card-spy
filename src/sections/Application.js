import React from 'react';
import './application.scss';

import {Layout, Fixed, Flex} from 'react-layout-pane';

import Header from './header/Header';
import Footer from './footer/Footer';
import CommandLog from './console/Console';
import Sidebar from './sidebar/Sidebar';


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
                device: device,
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

            //var application = applications[current];

            console.log(`\tCurrent application ${current}`);

            let x = newApplications.find((app) => { return app.name === current});
            if (x) {
                //console.log(`\tFound ${x.name} [${x.children}]`);
                x.children = [...x.children, response];
            }
            //     var children = newApplications[current].children;
            //     console.log(`app ${newApplications[current]} ${children} ${response}`);
            //     children.push(response);
            //     newApplications[current].children = children;
            // }

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
            //applications.map((aid) => {return {name: aid}
            let newApplications = [...this.state.applications, {name: application, children: []}];

            //newApplications[application] = ;

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
        //console.log(`clear repl`);
        this.setState({
            repl: ''
        });
    }

    replKeyUp(e) {
        //console.log(`keyUp ${e.target.value} ${e.keyCode}`);
        if (e.keyCode === 13 && this.state.repl.length > 0) {
            // enter
            ipc.send('repl', this.state.repl);
        }
    }

    replChange(e) {
        var value = e.target.value;
        //console.log(`replChange ${value}`);
        //e.keyCode ===
        this.setState({
           repl: value
        });
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
                <Fixed>
                    <Footer device={this.state.device}
                            card={this.state.card} />
                </Fixed>
            </Layout>

        );
    }
}

export default Application;
