import React from 'react';
import './application.scss';

import Header from './header/Header';
import Footer from './footer/Footer';
import Results from './results/Results';
import Sidebar from './sidebar/Sidebar';


const results = [
    { id: 0, name: 'Johnny', value:
`Same the year before. - That's right. We have one more month.
We won't see 'em till next summer.
They're travelling on the money, going where the waves are.
That's right!
The Ex-Presidents rip off banks to finance their endless summer!` },
    { id: 1, name: 'Warchild', value:`You stand straight up, you'll just fall over, so let's try it again.` },
    { id: 2, name: 'Bunker', value:`You're dragging your foot, you're gonna be fish food.` },
    { id: 3, name: 'Bodhi', value:`Caught my first tube this morning,... sir!` },
    { id: 4, name: 'Panda', value:`I'm a panda` }
];




class Application extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="column application">
                <Header />
                <div className="flex">
                    <div className="row">
                        <Sidebar />
                        <Results results={results} />
                        <div className="flex">
                            {this.props.children &&
                                React.cloneElement(this.props.children, { results: results})
                            }
                        </div>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }
}

export default Application;
