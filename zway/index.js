const EventEmitter = require('events');
const request = require('request');
const Socket = require('./socket');
const { ZWayDevice } = require('./device');

const floatTypes = [
	'device-temperature',
];

class ZWay extends EventEmitter {

	constructor({ host, username, password } = {}) {
		super();

		this.port = 8083;
		this.host = host;
		this.username = username;
		this.password = password;

		this.state = 2; // not connected
		this.failure = false;

		this.devices = [];
	}

	connect() {
		this.session = undefined;

		if (this.socket) {
			this.state = 1; // reconnecting

			this.socket.close();
			this.socket = undefined;
		}

		return this.load()
			.then(() => {
				this.state = 0; // connected

				this.socket = new Socket({
					host: this.host,
					port: this.port,
				});

				this.socket.on('message', (payload) => this.socketMessage(payload));
				this.socket.on('error', (e) => this.fail(e));
			})
			.catch((e) => this.fail(e));
	}

	fail(e) {
		this.failure = true;
		this.emit('error', e);

		setTimeout(() => this.connect(), 1000);
	}

	path(path) {
		return `http://${this.host}:${this.port}${path}`;
	}

	request(path, opts = {}) {
		const req = {
			method: 'GET',
			uri: this.path(path),
			...opts,
		};

		return new Promise((resolve, reject) => request(req, (err, response) => {
			if (err) return reject(err);

			try {
				if (response.body) {
					response.body = JSON.parse(response.body);
				}

				return resolve(response);
			} catch (e) {
				return reject(e);
			}
		}));
	}

	call(path, opts = {}) {
		const precondition = this.session
			? Promise.resolve()
			: this.login();

		return precondition
			.then(() => {
				const headers = {
					Cookie: `ZWAYSession=${this.session}`,
				};

				return this.request(path, {
					headers,
					...opts,
				}).then((response) => {
					this.emit('response', path, response.statusCode);

					if (response.statusCode === 401) {
						return this.login().then(() => this.request(path, {
							headers,
							...opts,
						}));
					}

					return response;
				});
			});
	}

	login() {
		const opts = {
			method: 'POST',
			body: JSON.stringify({
				login: this.username,
				password: this.password,
			}),
		};

		return this.request('/ZAutomation/api/v1/login', opts)
			.then((response) => {
				if (response.statusCode !== 200) return this.emit('error', 'authentication failed');

				this.session = response.body.data.sid;

				this.emit('login');

				return Promise.resolve();
			})
			.catch((e) => this.fail(e));
	}

	device(id) {
		return this.devices.find((d) => d.id === id);
	}

	register(id, data) {
		const device = new ZWayDevice(this, id, data);
		this.devices.push(device);

		this.emit('device', device);

		device.on('change', (key) => {
			if (this.state > 0) return;

			this.emit('change', device, key);
		});

		return device;
	}

	load() {
		return this.call('/ZAutomation/api/v1/devices')
			.then((response) => {
				if (response.statusCode !== 200) return Promise.reject();

				return response.body.data.devices;
			})
			.then((data) => data
				.filter((d) => d.visibility && d.nodeId)
				.reduce((res, d) => {
					if (!res[d.nodeId]) res[d.nodeId] = [];

					res[d.nodeId].push({
						key: d.id,
						name: d.probeType || d.deviceType,
						value: d.metrics.level,
					});

					return res;
				}, {}))
			.then((devices) => Object.keys(devices).forEach((id) => {
				const device = this.device(id);

				if (!device) {
					return this.register(id, devices[id]);
				}

				devices[id].forEach(({ key, ...value }) => device.set(key, value));

				return device;
			}))
			.catch((e) => this.fail(e));
	}

	socketMessage(data) {
		const device = this.devices.find((d) => d.props.find((p) => p.key === data.source));

		if (!device) return;

		let value = data.message.l;

		if (floatTypes.indexOf(data.type) >= 0) {
			value = parseFloat(value);
		}

		device.set(data.source, { value });
	}

	command(id, command, value) {
		const opts = {
			method: 'GET',
			qs: (value === undefined ? undefined : value),
		};

		this.emit('command', id, command, value);

		return this.call(`/ZAutomation/api/v1/devices/${id}/command/${command}`, opts)
			.catch((e) => this.fail(e));
	}

}

module.exports = { ZWay };
