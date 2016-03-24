import React from 'react';
import './device-status.scss';

export default ({status}) => { return <span className={`status device-status ${status}`}></span>};
