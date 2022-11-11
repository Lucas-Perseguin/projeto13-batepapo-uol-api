import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';

const participantSchema = joi.object({
  name: joi.string().required(),
});

const messageSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().required(),
});

const app = express();

// configs
dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

try {
  await mongoClient.connect();
  db = mongoClient.db('batePapoUol');
} catch (err) {
  console.log(err);
}

app.post('/participants', async (req, res) => {
  const validation = participantSchema.validate(req.body);

  if (validation.error) {
    res.status(422).send(validation.error.details);
    return;
  }

  try {
    const nameFound = await db
      .collection('participants')
      .findOne({ name: req.body.name });
    if (nameFound) {
      res.sendStatus(409);
      return;
    }
    const participantObject = {
      name: req.body.name,
      lastStatus: Date.now(),
    };
    await db.collection('particpants').insertOne(participantObject);
    res.status(201).send('Receita criada com sucesso!');
    const moment = dayjs().format('HH:MM:SS');
    const joinMessage = {
      form: req.body.name,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: moment,
    };
    db.collection('messages').insertOne(joinMessage);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find().toArray();
    res.status(200).send(participants);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/messages', async (req, res) => {
  const validation = messageSchema.validate(req.body);

  if (validation.error) {
    res.status(422).send(validation.error.details);
    return;
  }

  if (req.body.type !== 'message' && req.body.type !== 'private_message') {
    res.sendStatus(422);
    return;
  }

  const username = req.headers.user;

  if (!username) {
    res.sendStatus(422);
    return;
  }

  try {
    const nameFound = await db
      .collection('participants')
      .findOne({ name: username });
    if (!nameFound) {
      res.sendStatus(422);
      return;
    }
    const moment = dayjs().format('HH:MM:SS');
    const messageObject = {
      from: username,
      to: req.body.to,
      text: req.body.text,
      type: req.body.type,
      time: moment,
    };
    await db.collection('messages').insertOne(messageObject);
    res.sendStatus(201);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/messages', async (req, res) => {
  const { limit } = req.query;

  const username = req.headers.user;

  if (!username) {
    res.send(422);
    return;
  }

  try {
    const messages = await db.collection('messages').find().toArray();
    messages.reverse();
    const filteredMessages = messages.filter((message) => {
      if (
        message.to === 'Todos' ||
        message.to === username ||
        message.from === username
      ) {
        return true;
      } else return false;
    });
    if (!limit) {
      res.send(filteredMessages);
      return;
    } else {
      res.send(filteredMessages.slice(0, limit));
      return;
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/status', async (req, res) => {
  const username = req.headers.user;

  if (!username) {
    res.send(422);
    return;
  }

  try {
    const participant = await db
      .collection('participants')
      .findOne({ name: username });
    if (!participant) {
      res.sendStatus(404);
      return;
    }
    const moment = Date.now();
    participant.lastStatus = moment;
    await db
      .collection('participants')
      .updateOne({ name: username }, { $set: participant });
    res.send(200);
  } catch (err) {
    res.status(500).send(err);
  }
});

setInterval(async () => await checkInactivity(), 15000);

async function checkInactivity() {
  const participants = await db.collection('participants').find().toArray();
  const moment = Date.now();
  const inactiveParticipants = participants.filter(
    (participant) => moment - participant.lastStatus >= 10000
  );
  for (const participant of inactiveParticipants) {
    await db.collection('participants').deleteOne({ name: participant.name });
    const moment = dayjs().format('HH:MM:SS');
    const leaveMessage = {
      from: participant.name,
      to: 'Todos',
      text: 'sai na sala...',
      type: 'status',
      time: moment,
    };
    await db.collection('messages').insertOne(leaveMessage);
  }
}

app.delete('/messages/:message_id', async (req, res) => {
  const { ingredientes } = req.params;

  try {
    const { deletedCount } = await db
      .collection('receitas')
      .deleteMany({ ingredientes: ingredientes });

    if (!deletedCount) {
      return res.status(400).send('Nenhuma receita foi deletada');
    }

    res.send('Receitas deletadas com sucesso!');
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.put('/messages/:message_id', async (req, res) => {
  const { id } = req.params;
  const receita = req.body;

  const validation = receitaSchema.validate(receita, { abortEarly: false });

  if (validation.error) {
    const errors = validation.error.details.map((detail) => detail.message);
    res.send(errors);
    return;
  }

  try {
    const receitaEncontrada = await db
      .collection('receitas')
      .findOne({ _id: new ObjectId(id) });

    console.log(receitaEncontrada);

    if (!receitaEncontrada) {
      res.status(400).send('Receita não encontrada');
      return;
    }

    await db
      .collection('receitas')
      .updateOne({ _id: receitaEncontrada._id }, { $set: receita });

    res.send('Receita atualizada com sucesso!');
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.listen(5000, () => {
  console.log(`Server running in port: ${5000}`);
});
