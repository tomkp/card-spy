import React from "react";
import "./application.scss";
import {Layout, Flex} from "react-layout-pane";
import StatusBar from "./status-bar/StatusBar";
import electron from "electron";
const ipc = electron.ipcRenderer;



class Application extends React.Component {

    constructor(props) {
        super(props);
        
        ipc.on('device-activated', (event, {device, devices}) => {
            console.log(`* Device '${device}' activated, devices: '${devices}'`);

            devices.map((device, index) => {
                console.log(`* Device #${index + 1}: ${device}`);
            });

            let dx = this.state.dx;
            dx[device] = {device};

            this.setState({
                devices: devices,
                dx: dx
            });

            // if this is the only device (or the first)
            if (devices.length === 1) {
                this.setState({
                    device: device
                });
            }
        });
        ipc.on('device-deactivated', (event, {device, devices}) => {
            console.log(`* Device '${device.name}' deactivated, devices: '${devices}'`);

            let dx = this.state.dx;
            delete dx[device];

            this.setState({
                //device: null,
                devices: devices,
                dx: dx
            });
        });
        ipc.on('card-inserted', (event, {atr, device}) => {
            console.log(`* Card '${atr}' inserted into '${device}'`);

            let dx = this.state.dx;
            dx[device] = {device, card: atr};
            this.setState({
                card: atr,
                dx: dx
            });

            if (device === this.state.device) {
                let log = this.state.log;
                log.push({
                    type: 'card-inserted',
                    atr: atr,
                    device: device
                });
                this.setState({
                    log: log
                });
            }
        });
        ipc.on('card-removed', (event, {device}) => {
            console.log(`* Card removed from '${device}' `);

            let dx = this.state.dx;
            dx[device] = {device, card: null};

            this.setState({
                card: null,
                current: null,
                //device: null,
                applications: [],
                dx: dx
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
            console.log(`\t* Current application ${current}`);

            this.setState({
                log: log
            });
        });
        ipc.on('emv-application-found', (event, {applicationTemplateTlv}) => {
            console.log(`* EMV Application found '${applicationTemplateTlv}'`);
            let newApplications = [...this.state.applications, applicationTemplateTlv];
            this.setState({
                applications: newApplications
            });
            console.log(`Applications ${newApplications}`);
        });

        ipc.on('application-selected', (event, {application}) => {
            console.log(`* Application Selected ${application}`);
            this.setState({
                current: application
            });
        });


        ipc.on('error', (event, message) => {
            console.log(event, message);
        });

        this.state = {
            dx: {},
            device: null,
            devices: [],
            card: null,
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
        console.log(`* interrogate ${this.state.device}`);
        ipc.send('interrogate', {device: this.state.device});
    }

    replRun() {
        console.log(`* replRun ${this.state.device} ${this.state.repl}`);
        ipc.send('repl', {device: this.state.device, repl: this.state.repl});
    }

    onSelectDevice(deviceName) {
        console.log(`* onSelectDevice ${deviceName}`);
        this.setState({
            device: deviceName
        });
    }

    render() {
        //console.log(`Application.state: ${JSON.stringify(this.state)}`);
        //console.log(`\n\tApplication.state.dx: ${JSON.stringify(this.state.dx)}`);
        return (
            <Layout type="column">
                <Flex className="application">
                    {this.props.children &&
                    React.cloneElement(this.props.children, {
                        log: this.state.log,
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
                <StatusBar dx={this.state.dx} device={this.state.device} devices={this.state.devices} onSelectDevice={(device) => this.onSelectDevice(device)} card={this.state.card} />
            </Layout>
        );
    }
}

export default Application;
