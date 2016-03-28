import React from 'react';
import './status.scss';

export default ({name, status, title}) => { return <span className={`status ${name} ${status}`} title={title} ></span>};
