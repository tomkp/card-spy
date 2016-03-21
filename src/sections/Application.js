import React from 'react';
import './application.scss';

import Header from './header/Header';
import Footer from './footer/Footer';
import Results from './results/Results';
import Sidebar from './sidebar/Sidebar';




class Application extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="column application">
                <div className="flex"> </div>
                <Footer />
            </div>
        );
    }
}

export default Application;
