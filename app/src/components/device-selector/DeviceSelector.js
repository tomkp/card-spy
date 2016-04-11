import React from 'react';
import './device-selector.scss';


const Device = (device, active, onSelect) => {
    const d = `${device}`;
    return (<div className={`device ${active?'active':''}`} onClick={() => {
        console.log(`Device.onSelect('${device}') ${onSelect}`);
        onSelect(device);
    }}>[{d}]</div>)
};


export default ({currentDevice, devices, onSelect}) => {

    console.log(`DeviceSelector.render: '${currentDevice}' '${devices}' '${onSelect}'`);

    const children = devices.map((device, index) => {
        console.log(`device '${device}' '${currentDevice}' ${currentDevice === device}`);
        return <Device key={index} device={device} active={currentDevice === device} onSelect={onSelect} />
    });
    return (
        <div className={`device-selector`}>{children}</div>
    )
};
