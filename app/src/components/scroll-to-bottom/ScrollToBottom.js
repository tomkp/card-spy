import React, {Component, PropTypes} from "react";
import ReactDOM from "react-dom";
import "./scroll-to-bottom.scss";

export default class ScrollToBottom extends Component {

    componentWillUpdate() {
        const node = ReactDOM.findDOMNode(this);
        this.shouldScrollBottom = node.scrollTop + node.offsetHeight === node.scrollHeight;
    }

    componentDidUpdate() {
        if (this.shouldScrollBottom) {
            const node = ReactDOM.findDOMNode(this);
            node.scrollTop = node.scrollHeight;
        }
    }

    render() {
        return (<div className={`scroll-to-bottom ${this.props.className}`}>{this.props.children}</div>);
    }
}

ScrollToBottom.propTypes = {
    className: PropTypes.string,
    children: PropTypes.arrayOf(PropTypes.node).isRequired
};

ScrollToBottom.defaultProps = {};
