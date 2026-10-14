const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const Gateway = require('./gateway');
const {getLogger} = require('./../util/logger');

const log = getLogger(__filename);

class SmsGateway extends Gateway {

    constructor() {
        super();

        this.flag = String(process.env.SMS_ENABLED || 'false').toLowerCase() === 'true';
        this.client = new SNSClient({ region: process.env.AWS_REGION || 'ap-south-1' });
    }

    async demoSend(param) {
        const message = `Hearth sms OTP: ${param.otp}. Valid for ${param.ttlMin} minutes. Never share this OTP with anyone.`;

        if (log.isDebugEnabled()) {
            log.debug(message);
        }
        return Promise.resolve({
            success: true,
            message: 'Sms sent successfully',
            messageId: ''
        });
    }

    async send(param) {
        if (! this.flag) {
            return this.demoSend(param);
        }

        const message = `Hearth sms OTP: ${param.otp}. Valid for ${param.ttlMin} minutes. Never share this OTP with anyone.`;

        // SNS requires E.164 format (+<countrycode><number>). recipient is a bare
        // 10-digit Indian mobile number (see Utility.getIdentityType) - prefix +91.
        const phoneNumber = '+91' + param.recipient;

        const command = new PublishCommand({
            PhoneNumber: phoneNumber,
            Message: message,
            MessageAttributes: {
                'AWS.SNS.SMS.SMSType': {
                    DataType: 'String',
                    StringValue: 'Transactional'
                }
            }
        });

        if (log.isDebugEnabled()) {
            log.debug('Sending SMS OTP via SNS to %s', phoneNumber);
        }

        try {
            const response = await this.client.send(command);
            if (log.isDebugEnabled()) {
                log.debug('SNS publish succeeded. MessageId: %s', response.MessageId);
            }
            return {
                success: true,
                message: 'Sms sent successfully',
                messageId: response.MessageId
            };
        }
        catch (err) {
            log.error('Error sending SMS via SNS to %s: %s', phoneNumber, err.message);
            throw err;
        }
    }
}

module.exports = new SmsGateway();
