const EventEmitter = require('events');

class ZWayDevice extends EventEmitter {

	constructor(platform, id, props = []) {
		super();

		this.id = id;

		this.props = props;
		this.platform = platform;
	}

	set(key, value) {
		const prop = this.props.find((d) => d.key === key);

		if (!prop) {
			this.props.push({ key, ...value });
			return;
		}

		if (prop.value === value.value) return;
		prop.value = value.value;

		this.emit('change', key);
	}

	updateOne(name, value) {
		const prop = this.props.find((p) => p.name === name);

		if (!prop) return Promise.resolve();

		if (value === prop.value) return Promise.resolve();

		return this.platform.command(prop.key, value);
	}

	update(data) {
		return Promise.all(Object.keys(data)
			.map((key) => this.updateOne(key, data[key])));
	}

	toJSON() {
		return this.props.reduce((result, prop) => {
			result[prop.name || prop.key] = prop.value;
			return result;
		}, {});
	}

}

module.exports = { ZWayDevice };
