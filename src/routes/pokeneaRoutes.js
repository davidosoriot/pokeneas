const { Router } = require('express');
const pokeneaController = require('../controllers/pokeneaController');

const router = Router();

router.get('/', (req, res) => res.redirect('/pokenea'));
router.get('/pokenea', pokeneaController.showPage);
router.get('/api/pokenea', pokeneaController.showJson);

module.exports = router;
