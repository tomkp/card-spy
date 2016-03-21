import React from 'react';
import './footer.scss';

export default ({reader, status}) => {
    return <div className="footer">
        <span className="reader">{reader?reader.name:''}</span>
        <span className="atr" title="ATR (Answer To Reset)">{status?status.atr.toString('hex'):''}</span>
        <span className="device-status deactivated"></span>
        <span className="card-status removed"></span>
    </div>
};
