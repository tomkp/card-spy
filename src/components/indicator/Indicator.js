import React from 'react';
import './indicator.scss';

export default ({name, status, title}) => { return <span className={`indicator ${name} ${status}`} title={title} ></span>};
