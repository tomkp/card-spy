import React from 'react';
import Indicator from '../indicator/Indicator';
import DeviceSelector from '../device-selector/DeviceSelector';
import './status-bar.scss';

export default ({dx, device, devices, onSelectDevice, card}) => {

    const cx = dx[device] ? dx[device].card : null;

    return <div className="status-bar">
        <Indicator name="device-status" status={device?'activated':'deactivated'} title={device?'Device activated':'Device deactivated'} />
        <Indicator name="card-status" status={cx?'inserted':'removed'} title={cx?'Card inserted':'Card removed'} />
        <DeviceSelector currentDevice={device} devices={devices} onSelectDevice={onSelectDevice} />
    </div>
};

/*
 /*<div className="atr" title="ATR (Answer To Reset)">{cx?cx:''}</div>
 <div className="device-name">{device?device:''}</div>
 */


