/* @flow-weak */

import _ from "underscore";

import { createSelector } from 'reselect';

export const getSelectedDashboard = state => state.dashboard.selectedDashboard
export const getIsEditing         = state => state.dashboard.isEditing;
export const getCards             = state => state.dashboard.cards;
export const getDashboards        = state => state.dashboard.dashboards;
export const getDashcards         = state => state.dashboard.dashcards;
export const getCardData          = state => state.dashboard.cardData;
export const getCardDurations     = state => state.dashboard.cardDurations;
export const getCardIdList        = state => state.dashboard.cardList;
export const getRevisions         = state => state.dashboard.revisions;
export const getParameterValues   = state => state.dashboard.parameterValues;

export const getDatabases         = state => state.metadata.databases;

export const getDashboard = createSelector(
    [getSelectedDashboard, getDashboards],
    (selectedDashboard, dashboards) => dashboards[selectedDashboard]
);

export const getDashboardComplete = createSelector(
    [getDashboard, getDashcards],
    (dashboard, dashcards) => (dashboard && {
        ...dashboard,
        ordered_cards: dashboard.ordered_cards.map(id => dashcards[id]).filter(dc => !dc.isRemoved)
    })
);

export const getIsDirty = createSelector(
    [getDashboard, getDashcards],
    (dashboard, dashcards) => !!(
        dashboard && (
            dashboard.isDirty ||
            _.some(dashboard.ordered_cards, id => (
                !(dashcards[id].isAdded && dashcards[id].isRemoved) &&
                (dashcards[id].isDirty || dashcards[id].isAdded || dashcards[id].isRemoved)
            ))
        )
    )
);

export const getCardList = createSelector(
    [getCardIdList, getCards],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

export const getEditingParameterId = (state) => state.dashboard.editingParameterId;

export const getEditingParameter = createSelector(
    [getDashboard, getEditingParameterId],
    (dashboard, editingParameterId) => editingParameterId != null ? _.findWhere(dashboard.parameters, { id: editingParameterId }) : null
);

export const getIsEditingParameter = (state) => state.dashboard.editingParameterId != null;

const getDatabase = (state, props) => state.metadata.databases[props.card.dataset_query.database];
const getCard = (state, props) => props.card;
const getDashCard = (state, props) => props.dashcard;

export const getParameterTarget = createSelector(
    [getEditingParameter, getCard, getDashCard],
    (parameter, card, dashcard) => {
        const mapping = _.findWhere(dashcard.parameter_mappings, { card_id: card.id, parameter_id: parameter.id });
        return mapping && mapping.target;
    }
);

export const makeGetParameterMappingOptions = () => {

    const getParameterMappingOptions = createSelector(
        [getEditingParameter, getDatabase, getCard, getDashCard],
        (parameter, database, card, dashcard) => {
            if (card.dataset_query.type === "query") {
                const table = database && database.tables_lookup[card.dataset_query.query.source_table];
                if (table) {
                    return table.fields.map(field => {
                        const target = ["dimension", ["field", field.id]];
                        return {
                            name: field.display_name,
                            value: target
                        };
                    });
                }
            } else {
                return [
                    { name: "FIXME: SQL parameter options not yet implemented" }
                ];
            }
            return [];
        }
    );
    return getParameterMappingOptions;
}