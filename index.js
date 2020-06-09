const { connect } = require('mqtt');
const { ZWay } = require('./zway');
const { config } = require('./config');
const { version } = require('./package');

let online = false;
const subsciptions = {};

const topics = {
	state: () => `${config.mqtt.path}/state`,
	update: (id) => `${config.mqtt.path}/${id}`,
	change: (id) => `${config.mqtt.path}/${id}/set`,
};

const mqtt = connect(config.mqtt.host, {
	username: config.mqtt.username,
	password: config.mqtt.password,
	clientId: config.mqtt.id,
	will: {
		topic: topics.state(),
		payload: JSON.stringify({ online: false }),
		retain: true,
	},
});

const zway = new ZWay({
	host: config.zway.host,
	username: config.zway.username,
	password: config.zway.password,
});

const format = (type, args) => [
	(new Date()).toISOString().substring(0, 10),
	(new Date()).toTimeString().substring(0, 8),
	`[${type.toUpperCase()}]`,
	...args,
].join(' ');

const log = (type, ...args) => console.log(format(type, args));

const error = (type, ...args) => console.error(format(type, args));

mqtt.on('connect', () => log('mqtt', `connected to ${config.mqtt.host}`));

zway.connect();
setInterval(() => zway.connect(), 3600000);

zway.on('login', () => {
	if (online) return;

	log('zway', `authenticated on ${config.zway.host}`);

	online = true;

	mqtt.publish(topics.state(), JSON.stringify({
		online: true,
		version,
	}), { retain: true });
});

zway.on('device', (device) => {
	const topic = topics.change(device.id);

	mqtt.subscribe(topic);
	subsciptions[topic] = device;

	mqtt.publish(topics.update(device.id), JSON.stringify(device.toJSON()), {
		retain: true,
	});
});

zway.on('change', (device) => {
	log('zway', `update for ${device.id}`);
	log('zway', `  > ${JSON.stringify(device.toJSON())}`);

	mqtt.publish(topics.update(device.id), JSON.stringify(device.toJSON()), {
		retain: true,
	});
});

zway.on('command', (id, command, value) => {
	log('zway', `command [${id}, ${command}, ${value}]`);
});

zway.on('response', (path, statusCode) => {
	log('zway', `response ${statusCode} for ${path}`);
});

mqtt.on('message', (topic, data) => {
	const device = subsciptions[topic];

	if (!device) {
		error('mqtt', `received data for unknown device ${topic}`);
		return;
	}

	try {
		log('mqtt', `received update for ${topic}`);
		log('mqtt', `  > ${data.toString()}`);

		device.update(JSON.parse(data.toString()));
	} catch (e) {
		error('mqtt', 'not able to parse incoming message');
	}
});

zway.on('error', (e) => {
	error('zway', 'zway error');
	error('zway', `  > ${e.toString()}`);

	if (!online) return;

	online = false;

	zway.connect();

	mqtt.publish(topics.state(), JSON.stringify({
		online,
	}), { retain: true });
});

mqtt.on('error', (e) => {
	error('mqtt', 'connection error');
	error('mqtt', `  > ${e.toString()}`);

	// exiting in case of error so
	// supervisor can restart it
	process.exit(1);
});
