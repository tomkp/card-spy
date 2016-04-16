import React from "react";
import "./device-selector.scss";
import Indicator from '../indicator/Indicator';


const Device = ({dx, device, active, onSelectDevice}) => {

    const clicked = (e) => {
        onSelectDevice(device);
    };

    const cx = dx[device] ? dx[device].card : null;
    const d = `${device}`;
    return (
        <div className={`device ${active?'active':''}`} onClick={clicked}>
            <Indicator name="device-status" status={device?'activated':'deactivated'} title={device?'Device activated':'Device deactivated'} />
            <Indicator name="card-status" status={cx?'inserted':'removed'} title={cx?'Card inserted':'Card removed'} />
            {d}
        </div>
    )
};



export default class DeviceSelector extends React.Component {

    constructor(props) {
        super(props);
        this.state = {open: false};
    }

    clicked() {
        console.log(`clicked`);
        this.setState({open: !this.state.open});
    }

    onSelectDevice(device) {
        this.setState({open: false});
        this.props.onSelectDevice(device);
    }

    render() {
        console.log(`DeviceSelector.render: '${this.state.open}' '${this.props.currentDevice}' '${this.props.devices}' '${this.props.onSelectDevice}'`);

        const children = this.props.devices.map((device, index) => {
            //console.log(`device '${device}' '${currentDevice}' ${currentDevice === device} ${onSelectDevice}`);
            return <Device key={index} dx={this.props.dx} device={device} active={this.props.currentDevice === device}
                           onSelectDevice={() => this.onSelectDevice(device)} />
        });
        return (
            <div className={`device-selector`}>
                <div className="popup-handle" onClick={() => this.clicked()}>{this.props.currentDevice?this.props.currentDevice:'Select device'}</div>
                {this.state.open?<div className="popup">{children}</div>:''}
            </div>
        )
    }
};
