import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";

import ParameterWidget from "./parameters/ParameterWidget.jsx";

import { createParameter, setParameterName } from "metabase/meta/Dashboard";

import screenfull from "screenfull";

import _ from "underscore";
import cx from "classnames";
import querystring from "querystring";

const TICK_PERIOD = 0.25; // seconds

export default class Dashboard extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null,

            isFullscreen: false,
            isNightMode: false,

            refreshPeriod: null,
            refreshElapsed: null
        };

        _.bindAll(this,
            "setRefreshPeriod", "tickRefreshClock",
            "setFullscreen", "setNightMode", "fullScreenChanged",
            "setEditing", "setDashboardAttribute",
            "addParameter"
        );
    }

    static propTypes = {
        isEditing: PropTypes.bool.isRequired,
        isEditingParameter: PropTypes.bool.isRequired,

        dashboard: PropTypes.object,
        cards: PropTypes.array,

        addCardToDashboard: PropTypes.func.isRequired,
        deleteDashboard: PropTypes.func.isRequired,
        fetchCards: PropTypes.func.isRequired,
        fetchDashboard: PropTypes.func.isRequired,
        fetchRevisions: PropTypes.func.isRequired,
        revertToRevision: PropTypes.func.isRequired,
        saveDashboard: PropTypes.func.isRequired,
        setDashboardAttributes: PropTypes.func.isRequired,
        setEditingDashboard: PropTypes.func.isRequired,
        setDashCardVisualizationSetting: PropTypes.func.isRequired,

        onChangeLocation: PropTypes.func.isRequired,
        onDashboardDeleted: PropTypes.func.isRequired,
    };

    async componentDidMount() {
        this.loadParams();

        try {
            await this.props.fetchDashboard(this.props.selectedDashboard);
            if (this.props.addCardOnLoad) {
                // we have to load our cards before we can add one
                await this.props.fetchCards();
                this.setEditing(true);
                this.props.addCardToDashboard({ dashId: this.props.selectedDashboard, cardId: this.props.addCardOnLoad });
            }
        } catch (error) {
            console.error(error)
            if (error.status === 404) {
                this.props.onChangeLocation("/404");
            } else {
                this.setState({ error });
            }
        }
    }

    componentDidUpdate() {
        this.updateParams();

        if (this.state.isFullscreen) {
            document.querySelector(".Nav").classList.add("hide");
        } else {
            document.querySelector(".Nav").classList.remove("hide");
        }
    }

    componentWillReceiveProps(nextProps) {
        if (!_.isEqual(this.props.parameterValues, nextProps.parameterValues)) {
            this.fetchDashboardCardData();
        }
    }

    componentWillMount() {
        if (screenfull.enabled) {
            document.addEventListener(screenfull.raw.fullscreenchange, this.fullScreenChanged);
        }
    }

    componentWillUnmount() {
        document.querySelector(".Nav").classList.remove("hide");
        this._clearRefreshInterval();
        if (screenfull.enabled) {
            document.removeEventListener(screenfull.raw.fullscreenchange, this.fullScreenChanged);
        }
    }

    loadParams() {
        let params = querystring.parse(window.location.hash.substring(1));
        let refresh = parseInt(params.refresh);
        this.setRefreshPeriod(Number.isNaN(refresh) || refresh === 0 ? null : refresh);
        this.setNightMode("night" in params);
        this.setFullscreen("fullscreen" in params);
    }

    updateParams() {
        let params = {};
        if (this.state.refreshPeriod) {
            params.refresh = this.state.refreshPeriod;
        }
        if (this.state.isFullscreen) {
            params.fullscreen = true;
        }
        if (this.state.isNightMode) {
            params.night = true;
        }
        let hash = querystring.stringify(params).replace(/=true\b/g, "");
        hash = (hash ? "#" + hash : "");
        // setting window.location.hash = "" causes the page to reload for some reason
        if (hash !== window.location.hash) {
            history.replaceState(null, document.title, window.location.pathname + hash);
        }
    }

    _clearRefreshInterval() {
        if (this._interval != null) {
            clearInterval(this._interval);
        }
    }

    setRefreshPeriod(refreshPeriod) {
        this._clearRefreshInterval();
        if (refreshPeriod != null) {
            this._interval = setInterval(this.tickRefreshClock, TICK_PERIOD * 1000);
            this.setState({ refreshPeriod, refreshElapsed: 0 });
            MetabaseAnalytics.trackEvent("Dashboard", "Set Refresh", refreshPeriod);
        } else {
            this.setState({ refreshPeriod: null, refreshElapsed: null });
        }
    }

    setNightMode(isNightMode) {
        this.setState({ isNightMode });
    }

    setFullscreen(isFullscreen, browserFullscreen = true) {
        if (isFullscreen !== this.state.isFullscreen) {
            if (screenfull.enabled && browserFullscreen) {
                if (isFullscreen) {
                    screenfull.request();
                } else {
                    screenfull.exit();
                }
            }
            this.setState({ isFullscreen });
        }
    }

    fullScreenChanged() {
        this.setState({ isFullscreen: screenfull.isFullscreen });
    }

    setEditing(isEditing) {
        this.setRefreshPeriod(null);
        this.props.setEditingDashboard(isEditing);
    }

    setDashboardAttribute(attribute, value) {
        this.props.setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { [attribute]: value }
        });
    }

    addParameter(parameterOption) {
        let parameters = this.props.dashboard && this.props.dashboard.parameters || [];

        let parameter = createParameter(parameterOption);


        this.setDashboardAttribute("parameters", [...parameters, parameter]);
        this.props.setEditingParameterId(parameter.id);
    }

    removeParameter(parameterId) {
        let parameters = this.props.dashboard && this.props.dashboard.parameters || [];
        parameters = _.reject(parameters, (p) => p.id === parameterId);
        this.setDashboardAttribute("parameters", parameters);
    }

    setParameterName(parameter, name) {
        let parameters = this.props.dashboard.parameters || [];
        let index = _.findIndex(parameters, (p) => p.id === parameter.id);
        if (index < 0) {
            return;
        }

        this.props.setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { "parameters": [
                ...parameters.slice(0, index),
                setParameterName(parameter, name),
                ...parameters.slice(index + 1)
            ] }
        });
    }

    // we don't call this initially because DashCards initiate their own fetchCardData
    fetchDashboardCardData() {
        console.log("refreshing card data");
        for (const dashcard of this.props.dashboard.ordered_cards) {
            const cards = [dashcard.card].concat(dashcard.series || []);
            for (const card of cards) {
                this.props.fetchCardData(card, dashcard);
            }
        }
    }

    async tickRefreshClock() {
        let refreshElapsed = (this.state.refreshElapsed || 0) + TICK_PERIOD;
        if (refreshElapsed >= this.state.refreshPeriod) {
            refreshElapsed = 0;

            await this.props.fetchDashboard(this.props.selectedDashboard);
            this.fetchDashboardCardData();
        }
        this.setState({ refreshElapsed });
    }

    render() {
        let { dashboard, isEditing, editingParameter, parameterValues } = this.props;
        let { error, isFullscreen, isNightMode } = this.state;
        isNightMode = isNightMode && isFullscreen;

        const parameterSlugCounts = {};
        if (this.props.dashboard) {
            for (const param of this.props.dashboard.parameters) {
                parameterSlugCounts[param.slug] = (parameterSlugCounts[param.slug] || 0) + 1
            }
        }

        return (
            <LoadingAndErrorWrapper style={{ minHeight: "100%" }} className={cx("Dashboard absolute top left right", { "Dashboard--fullscreen": isFullscreen, "Dashboard--night": isNightMode})} loading={!dashboard} error={error}>
            {() =>
                <div className="full" style={{ overflowX: "hidden" }}>
                    <header className="DashboardHeader relative z2">
                        <DashboardHeader
                            {...this.props}
                            isFullscreen={this.state.isFullscreen}
                            isNightMode={this.state.isNightMode}
                            refreshPeriod={this.state.refreshPeriod}
                            refreshElapsed={this.state.refreshElapsed}
                            setRefreshPeriod={this.setRefreshPeriod}
                            onFullscreenChange={this.setFullscreen}
                            onNightModeChange={this.setNightMode}
                            onEditingChange={this.setEditing}
                            setDashboardAttribute={this.setDashboardAttribute}
                            addParameter={this.addParameter}
                        />
                    </header>
                    {this.props.dashboard.parameters && this.props.dashboard.parameters.length > 0 &&
                        <div className="wrapper flex flex-column align-end mt1">
                            <div className="flex flex-row align-end" ref="parameters">
                                {this.props.dashboard.parameters.map(parameter =>
                                    <ParameterWidget
                                        className="ml1"
                                        parameter={parameter}
                                        isEditing={isEditing}
                                        isSelected={editingParameter && editingParameter.id === parameter.id}
                                        isValid={(parameter.slug && parameterSlugCounts[parameter.slug] < 2) && parameter.name !== ""}
                                        onNameChange={(name) => this.setParameterName(parameter, name)}
                                        setEditingParameterId={this.props.setEditingParameterId}
                                        setParameterValue={this.props.setParameterValue}
                                        parameterValue={parameterValues[parameter.id]}
                                    />
                                )}
                            </div>
                        </div>
                    }
                    <div className="wrapper">

                        { dashboard.ordered_cards.length === 0 ?
                            <div className="absolute z1 top bottom left right flex flex-column layout-centered">
                                <span className="QuestionCircle">?</span>
                                <div className="text-normal mt3 mb1">This dashboard is looking empty.</div>
                                <div className="text-normal text-grey-2">Add a question to start making it useful!</div>
                            </div>
                        :
                            <DashboardGrid
                                {...this.props}
                                isFullscreen={this.state.isFullscreen}
                                onEditingChange={this.setEditing}
                            />
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}