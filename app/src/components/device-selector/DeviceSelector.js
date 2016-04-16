import React from 'react';
import './device-selector.scss';


const Device = ({device, active, onSelectDevice}) => {

    const clicked = (e) => {
        onSelectDevice(device);
    };

    const d = `${device}`;
    return (<div className={`device ${active?'active':''}`} onClick={clicked}>[{d}]</div>)
};


export default ({currentDevice, devices, onSelectDevice}) => {

    //console.log(`DeviceSelector.render: '${currentDevice}' '${devices}' '${onSelectDevice}'`);

    const children = devices.map((device, index) => {
        //console.log(`device '${device}' '${currentDevice}' ${currentDevice === device} ${onSelectDevice}`);
        return <Device key={index} device={device} active={currentDevice === device} onSelectDevice={onSelectDevice} />
    });
    return (
        <div className={`device-selector`}>{children}</div>
    )
};
