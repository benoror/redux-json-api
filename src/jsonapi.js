import { createAction, handleActions } from 'redux-actions';
import 'fetch-everywhere';
import imm from 'object-path-immutable';

import {
  addLinksToState,
  removeResourceFromState,
  updateOrInsertResourcesIntoState,
  setIsInvalidatingForExistingResource,
  ensureResourceTypeInState
} from './state-mutation';

import { apiRequest, getPaginationUrl } from './utils';
import {
  API_SET_ENDPOINT_HOST, API_SET_ENDPOINT_PATH, API_SET_HEADERS, API_SET_HEADER, API_WILL_CREATE, API_CREATED, API_CREATE_FAILED, API_WILL_READ, API_READ, API_READ_FAILED, API_WILL_UPDATE, API_UPDATED, API_UPDATE_FAILED, API_WILL_DELETE, API_DELETED, API_DELETE_FAILED
} from './constants';

// Resource isInvalidating values
export const IS_DELETING = 'IS_DELETING';
export const IS_UPDATING = 'IS_UPDATING';

// Action creators
export const setEndpointHost = createAction(API_SET_ENDPOINT_HOST);
export const setEndpointPath = createAction(API_SET_ENDPOINT_PATH);
export const setHeaders = createAction(API_SET_HEADERS);
export const setHeader = createAction(API_SET_HEADER);

const apiWillCreate = createAction(API_WILL_CREATE);
const apiCreated = createAction(API_CREATED);
const apiCreateFailed = createAction(API_CREATE_FAILED);

const apiWillRead = createAction(API_WILL_READ);
const apiRead = createAction(API_READ);
const apiReadFailed = createAction(API_READ_FAILED);

const apiWillUpdate = createAction(API_WILL_UPDATE);
const apiUpdated = createAction(API_UPDATED);
const apiUpdateFailed = createAction(API_UPDATE_FAILED);

const apiWillDelete = createAction(API_WILL_DELETE);
const apiDeleted = createAction(API_DELETED);
const apiDeleteFailed = createAction(API_DELETE_FAILED);

// Actions
export const setAccessToken = (at) => {
  return (dispatch) => {
    dispatch(setHeader({ Authorization: `Bearer ${at}` }));
  };
};

export const createResource = (resource) => {
  return (dispatch, getState) => {
    dispatch(apiWillCreate(resource));

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    const endpoint = `${apiHost}${apiPath}/${resource.type}`;

    return new Promise((resolve, reject) => {
      apiRequest(endpoint, {
        headers,
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          data: resource
        })
      }).then(json => {
        dispatch(apiCreated(json));
        resolve(json);
      }).catch(error => {
        const err = error;
        err.resource = resource;

        dispatch(apiCreateFailed(err));
        reject(err);
      });
    });
  };
};

class ApiResponse {
  constructor(response, dispatch, nextUrl, prevUrl) {
    this.body = response;
    this.dispatch = dispatch;
    this.nextUrl = nextUrl;
    this.prevUrl = prevUrl;
  }

  /* eslint-disable */
  loadNext = () => this.dispatch(readEndpoint(this.nextUrl));

  loadPrev = () => this.dispatch(readEndpoint(this.prevUrl));
  /* eslint-enable */
}

export const readEndpoint = (endpoint, {
  options = {
    indexLinks: undefined,
  }
} = {}) => {
  return (dispatch, getState) => {
    dispatch(apiWillRead(endpoint));

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    const apiEndpoint = `${apiHost}${apiPath}/${endpoint}`;

    return new Promise((resolve, reject) => {
      apiRequest(`${apiEndpoint}`, {
        headers,
        credentials: 'include'
      })
        .then(json => {
          dispatch(apiRead({ endpoint, options, ...json }));

          const nextUrl = getPaginationUrl(json, 'next', apiHost, apiPath);
          const prevUrl = getPaginationUrl(json, 'prev', apiHost, apiPath);

          resolve(new ApiResponse(json, dispatch, nextUrl, prevUrl));
        })
        .catch(error => {
          const err = error;
          err.endpoint = endpoint;

          dispatch(apiReadFailed(err));
          reject(err);
        });
    });
  };
};

export const updateResource = (resource) => {
  return (dispatch, getState) => {
    dispatch(apiWillUpdate(resource));

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    const endpoint = `${apiHost}${apiPath}/${resource.type}/${resource.id}`;

    return new Promise((resolve, reject) => {
      apiRequest(endpoint, {
        headers,
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({
          data: resource
        })
      }).then(json => {
        dispatch(apiUpdated(json));
        resolve(json);
      }).catch(error => {
        const err = error;
        err.resource = resource;

        dispatch(apiUpdateFailed(err));
        reject(err);
      });
    });
  };
};

export const deleteResource = (resource) => {
  return (dispatch, getState) => {
    dispatch(apiWillDelete(resource));

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    const endpoint = `${apiHost}${apiPath}/${resource.type}/${resource.id}`;

    return new Promise((resolve, reject) => {
      apiRequest(endpoint, {
        headers,
        method: 'DELETE',
        credentials: 'include'
      }).then(() => {
        dispatch(apiDeleted(resource));
        resolve();
      }).catch(error => {
        const err = error;
        err.resource = resource;

        dispatch(apiDeleteFailed(err));
        reject(err);
      });
    });
  };
};

export const requireResource = (resourceType, endpoint = resourceType) => {
  return (dispatch, getState) => {
    return new Promise((resolve, reject) => {
      const { api } = getState();
      if (api.hasOwnProperty(resourceType)) {
        resolve();
      }

      dispatch(readEndpoint(endpoint))
        .then(resolve)
        .catch(reject);
    });
  };
};

// Reducers
export const reducer = handleActions({

  [API_SET_HEADERS]: (state, { payload: headers }) => {
    return imm(state).set(['endpoint', 'headers'], headers).value();
  },

  [API_SET_HEADER]: (state, { payload: header }) => {
    const newState = imm(state);
    Object.keys(header).forEach(key => {
      newState.set(['endpoint', 'headers', key], header[key]);
    });

    return newState.value();
  },

  [API_SET_ENDPOINT_HOST]: (state, { payload: host }) => {
    return imm(state).set(['endpoint', 'host'], host).value();
  },

  [API_SET_ENDPOINT_PATH]: (state, { payload: path }) => {
    return imm(state).set(['endpoint', 'path'], path).value();
  },

  [API_WILL_CREATE]: (state) => {
    return imm(state).set(['isCreating'], state.isCreating + 1).value();
  },

  [API_CREATED]: (state, { payload: resources }) => {
    const entities = Array.isArray(resources.data) ? resources.data : [resources.data];

    const newState = updateOrInsertResourcesIntoState(
      state,
      entities.concat(resources.included || [])
    );

    return imm(newState)
      .set('isCreating', state.isCreating - 1)
      .value();
  },

  [API_CREATE_FAILED]: (state) => {
    return imm(state).set(['isCreating'], state.isCreating - 1).value();
  },

  [API_WILL_READ]: (state) => {
    return imm(state).set(['isReading'], state.isReading + 1).value();
  },

  [API_READ]: (state, { payload }) => {
    const resources = (
      Array.isArray(payload.data)
        ? payload.data
        : [payload.data]
    ).concat(payload.included || []);

    const newState = updateOrInsertResourcesIntoState(state, resources);
    const finalState = addLinksToState(newState, payload.links, payload.options);

    return imm(finalState)
      .set('isReading', state.isReading - 1)
      .value();
  },

  [API_READ_FAILED]: (state) => {
    return imm(state).set(['isReading'], state.isReading - 1).value();
  },

  [API_WILL_UPDATE]: (state, { payload: resource }) => {
    const { type, id } = resource;

    const newState = ensureResourceTypeInState(state, type);

    return setIsInvalidatingForExistingResource(newState, { type, id }, IS_UPDATING)
      .set('isUpdating', state.isUpdating + 1)
      .value();
  },

  [API_UPDATED]: (state, { payload: resources }) => {
    const entities = Array.isArray(resources.data) ? resources.data : [resources.data];

    const newState = updateOrInsertResourcesIntoState(
      state,
      entities.concat(resources.included || [])
    );

    return imm(newState)
      .set('isUpdating', state.isUpdating - 1)
      .value();
  },

  [API_UPDATE_FAILED]: (state, { payload: { resource } }) => {
    const { type, id } = resource;

    return setIsInvalidatingForExistingResource(state, { type, id }, IS_UPDATING)
      .set('isUpdating', state.isUpdating + 1)
      .value();
  },

  [API_WILL_DELETE]: (state, { payload: resource }) => {
    const { type, id } = resource;

    return setIsInvalidatingForExistingResource(state, { type, id }, IS_DELETING)
      .set('isDeleting', state.isDeleting + 1)
      .value();
  },

  [API_DELETED]: (state, { payload: resource }) => {
    return removeResourceFromState(state, resource)
      .set('isDeleting', state.isDeleting - 1)
      .value();
  },

  [API_DELETE_FAILED]: (state, { payload: { resource } }) => {
    const { type, id } = resource;

    return setIsInvalidatingForExistingResource(state, { type, id }, IS_DELETING)
      .set('isDeleting', state.isDeleting + 1)
      .value();
  }

}, {
  isCreating: 0,
  isReading: 0,
  isUpdating: 0,
  isDeleting: 0,
  endpoint: {
    host: null,
    path: null,
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json'
    }
  }
});
