/*
 * Lightweight i18n for the desktop UI.
 *
 * `lang` is reactive (Vue.observable), so any template using the global `$t('key')` mixin
 * re-renders when the language changes. t() falls back to English, then to the raw key.
 * Scope: the visible chrome (menus, project panel, preview transport, common buttons, section
 * titles). Not the full help library.
 */
import Vue from 'vue';

export const LANGUAGES = [
	{ id: 'en', label: 'English' },
	{ id: 'ru', label: 'Русский' },
	{ id: 'fr', label: 'Français' },
	{ id: 'ja', label: '日本語' },
];

const STRINGS = {
	en: {
		'menu.file': 'File', 'menu.examples': 'Examples', 'menu.view': 'View', 'menu.help': 'Help',
		'menu.language': 'Language',
		'menu.import': 'Import', 'menu.download': 'Download',
		'menu.switch_code': 'Switch to Code', 'menu.code_to_side': 'Open Code View to Side',

		'tab.config': 'Configure', 'tab.code': 'Code', 'tab.preview': 'Preview', 'tab.help': 'Help',

		'project.untitled': 'No project', 'project.open_folder': 'Open Folder',
		'project.open_project': 'Open Project (.snow)', 'project.new': 'New Particle',
		'project.save': 'Save (Ctrl+S)', 'project.search': 'Search particles…',
		'project.empty': 'Open a folder or .snow project to see your particles here.',

		'preview.play': 'Play', 'preview.pause': 'Pause', 'preview.collisions': 'Preview Collisions',
		'preview.path': 'Preview particle path (full lifetime)',
		'preview.rotation': 'Preview particle rotation along path',
		'preview.shape': 'Show spawn-shape outline', 'preview.time': 'Time of day',
		'preview.variables': 'Show Variable Placeholder Bar',

		'time.default': 'Default', 'time.day': 'Day', 'time.sunset': 'Sunset', 'time.night': 'Night', 'time.cave': 'Cave',

		'common.confirm': 'Confirm', 'common.cancel': 'Cancel', 'common.save': 'Save',

		'preset.uv': 'UV pattern', 'preset.spawn': 'Spawn preset', 'preset.custom': 'Custom (your own values)',
	},
	ru: {
		'menu.file': 'Файл', 'menu.examples': 'Примеры', 'menu.view': 'Вид', 'menu.help': 'Помощь',
		'menu.language': 'Язык',
		'menu.import': 'Импорт', 'menu.download': 'Скачать',
		'menu.switch_code': 'Перейти к коду', 'menu.code_to_side': 'Открыть код сбоку',

		'tab.config': 'Настройка', 'tab.code': 'Код', 'tab.preview': 'Просмотр', 'tab.help': 'Помощь',

		'project.untitled': 'Нет проекта', 'project.open_folder': 'Открыть папку',
		'project.open_project': 'Открыть проект (.snow)', 'project.new': 'Новая частица',
		'project.save': 'Сохранить (Ctrl+S)', 'project.search': 'Поиск частиц…',
		'project.empty': 'Откройте папку или проект .snow, чтобы увидеть частицы здесь.',

		'preview.play': 'Воспроизвести', 'preview.pause': 'Пауза', 'preview.collisions': 'Показать столкновения',
		'preview.path': 'Показать путь частицы (вся жизнь)',
		'preview.rotation': 'Показать вращение частицы вдоль пути',
		'preview.shape': 'Показать контур формы спавна', 'preview.time': 'Время суток',
		'preview.variables': 'Показать панель переменных',

		'time.default': 'По умолчанию', 'time.day': 'День', 'time.sunset': 'Закат', 'time.night': 'Ночь', 'time.cave': 'Пещера',

		'common.confirm': 'Подтвердить', 'common.cancel': 'Отмена', 'common.save': 'Сохранить',

		'preset.uv': 'Шаблон UV', 'preset.spawn': 'Пресет спавна', 'preset.custom': 'Свои значения',
	},
	fr: {
		'menu.file': 'Fichier', 'menu.examples': 'Exemples', 'menu.view': 'Affichage', 'menu.help': 'Aide',
		'menu.language': 'Langue',
		'menu.import': 'Importer', 'menu.download': 'Télécharger',
		'menu.switch_code': 'Passer au code', 'menu.code_to_side': 'Ouvrir le code à côté',

		'tab.config': 'Configurer', 'tab.code': 'Code', 'tab.preview': 'Aperçu', 'tab.help': 'Aide',

		'project.untitled': 'Aucun projet', 'project.open_folder': 'Ouvrir un dossier',
		'project.open_project': 'Ouvrir un projet (.snow)', 'project.new': 'Nouvelle particule',
		'project.save': 'Enregistrer (Ctrl+S)', 'project.search': 'Rechercher des particules…',
		'project.empty': 'Ouvrez un dossier ou un projet .snow pour voir vos particules ici.',

		'preview.play': 'Lecture', 'preview.pause': 'Pause', 'preview.collisions': 'Aperçu des collisions',
		'preview.path': 'Aperçu de la trajectoire (durée de vie complète)',
		'preview.rotation': 'Aperçu de la rotation le long de la trajectoire',
		'preview.shape': 'Afficher le contour de la forme', 'preview.time': 'Heure du jour',
		'preview.variables': 'Afficher la barre des variables',

		'time.default': 'Défaut', 'time.day': 'Jour', 'time.sunset': 'Coucher', 'time.night': 'Nuit', 'time.cave': 'Grotte',

		'common.confirm': 'Confirmer', 'common.cancel': 'Annuler', 'common.save': 'Enregistrer',

		'preset.uv': 'Motif UV', 'preset.spawn': 'Préréglage de spawn', 'preset.custom': 'Personnalisé (vos valeurs)',
	},
	ja: {
		'menu.file': 'ファイル', 'menu.examples': '例', 'menu.view': '表示', 'menu.help': 'ヘルプ',
		'menu.language': '言語',
		'menu.import': 'インポート', 'menu.download': 'ダウンロード',
		'menu.switch_code': 'コード表示に切替', 'menu.code_to_side': 'コードを横に開く',

		'tab.config': '設定', 'tab.code': 'コード', 'tab.preview': 'プレビュー', 'tab.help': 'ヘルプ',

		'project.untitled': 'プロジェクトなし', 'project.open_folder': 'フォルダーを開く',
		'project.open_project': 'プロジェクトを開く (.snow)', 'project.new': '新しいパーティクル',
		'project.save': '保存 (Ctrl+S)', 'project.search': 'パーティクルを検索…',
		'project.empty': 'フォルダーまたは .snow プロジェクトを開くと、ここにパーティクルが表示されます。',

		'preview.play': '再生', 'preview.pause': '一時停止', 'preview.collisions': '衝突をプレビュー',
		'preview.path': 'パーティクルの軌道をプレビュー（全寿命）',
		'preview.rotation': '軌道に沿った回転をプレビュー',
		'preview.shape': 'スポーン形状の輪郭を表示', 'preview.time': '時刻',
		'preview.variables': '変数バーを表示',

		'time.default': '既定', 'time.day': '昼', 'time.sunset': '夕暮れ', 'time.night': '夜', 'time.cave': '洞窟',

		'common.confirm': '確定', 'common.cancel': 'キャンセル', 'common.save': '保存',

		'preset.uv': 'UV パターン', 'preset.spawn': 'スポーン プリセット', 'preset.custom': 'カスタム（自分の値）',
	},
};

const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('snowstorm_language')) || 'en';
export const i18nState = Vue.observable({ lang: STRINGS[stored] ? stored : 'en' });

export function t(key) {
	let lang = i18nState.lang;
	return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}

export function setLanguage(lang) {
	if (!STRINGS[lang]) return;
	i18nState.lang = lang;
	try { localStorage.setItem('snowstorm_language', lang); } catch (e) {}
}

export function currentLanguage() {
	return i18nState.lang;
}

// Global $t so every component/template can translate without importing.
Vue.mixin({
	methods: {
		$t(key) { return t(key); },
	},
});

export default { t, setLanguage, currentLanguage, LANGUAGES, i18nState };
