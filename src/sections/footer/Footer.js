import React from 'react';
import DeviceStatus from './device-status/DeviceStatus';
import './footer.scss';

export default ({reader, status}) => {
    return <div className="footer">
        <span className="reader">{reader?reader.name:''}</span>
        <span className="atr" title="ATR (Answer To Reset)">{status?status.atr.toString('hex'):''}</span>
        <DeviceStatus status="deactivated" />
        <span className="card-status removed"></span>
    </div>
};
