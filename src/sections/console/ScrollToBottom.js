import React from 'react';
import ReactDOM from 'react-dom';
import './scroll-to-bottom.scss';

export default class extends React.Component {

    constructor() {
        super();
    }

    componentWillUpdate() {
        console.log(`ScrollToBottom.componentWillUpdate`);
        var node = ReactDOM.findDOMNode(this);
        this.shouldScrollBottom = node.scrollTop + node.offsetHeight === node.scrollHeight;
    };

    componentDidUpdate() {
        console.log(`ScrollToBottom.componentDidUpdate`);
        if (this.shouldScrollBottom) {
            var node = ReactDOM.findDOMNode(this);
            node.scrollTop = node.scrollHeight
        }
    };

    render() {
        //console.log(`ScrollToBottom.render`);
        return <div className={`scroll-to-bottom ${this.props.className}`}>{this.props.children}</div>;
    }
};