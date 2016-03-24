import React from 'react';
import './status.scss';

export default ({name, status}) => { return <span className={`status ${name} ${status}`}></span>};
