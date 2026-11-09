(function () {
  "use strict";

  var STORAGE_KEY = "booknest-data-v1";
  var FINE_PER_DAY = 5;
  var DEFAULT_LOAN_DAYS = 14;

  var state = loadState();

  function emptyState() {
    return { books: [], students: [], issues: [] };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.books) || !Array.isArray(data.students) || !Array.isArray(data.issues)) {
        return emptyState();
      }
      return data;
    } catch (e) {
      return emptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function $(id) { return document.getElementById(id); }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDays(iso, days) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function daysBetween(fromISO, toISO) {
    var a = new Date(fromISO + "T00:00:00");
    var b = new Date(toISO + "T00:00:00");
    return Math.floor((b - a) / 86400000);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var toastTimer;
  function showToast(msg, isError) {
    var el = $("toast");
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "toast"; }, 2800);
  }

  function bookById(id) {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === id) return state.books[i];
    return null;
  }
  function studentById(id) {
    for (var i = 0; i < state.students.length; i++) if (state.students[i].id === id) return state.students[i];
    return null;
  }

  function availableCopies(bookId) {
    var book = bookById(bookId);
    if (!book) return 0;
    var out = 0;
    for (var i = 0; i < state.issues.length; i++) {
      if (state.issues[i].bookId === bookId && !state.issues[i].returnDate) out++;
    }
    return Math.max(0, Number(book.copies) - out);
  }

  function activeIssues() {
    return state.issues.filter(function (i) { return !i.returnDate; });
  }

  function overdueActive(today) {
    return activeIssues().filter(function (i) { return i.dueDate < today; });
  }

  function unpaidFineTotal() {
    var sum = 0;
    for (var i = 0; i < state.issues.length; i++) {
      var it = state.issues[i];
      if (it.returnDate && it.fine > 0 && !it.finePaid) sum += Number(it.fine);
    }
    return sum;
  }

  function renderNav() {
    var btns = document.querySelectorAll(".nav-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var view = this.getAttribute("data-view");
        setView(view);
      });
    }
  }

  function setView(name) {
    var btns = document.querySelectorAll(".nav-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-view") === name);
    }
    var views = document.querySelectorAll(".view");
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle("active", views[j].id === "view-" + name);
    }
    renderAll();
  }

  function renderDashboard() {
    var today = todayISO();
    var totalCopies = 0;
    var available = 0;
    for (var i = 0; i < state.books.length; i++) {
      totalCopies += Number(state.books[i].copies) || 0;
      available += availableCopies(state.books[i].id);
    }
    $("stat-total-books").textContent = String(totalCopies);
    $("stat-available").textContent = String(available);
    $("stat-active").textContent = String(activeIssues().length);
    $("stat-students").textContent = String(state.students.length);
    $("stat-overdue").textContent = String(overdueActive(today).length);
    $("stat-fines").textContent = "₹" + unpaidFineTotal();

    var recent = state.issues.slice().sort(function (a, b) {
      var da = a.returnDate || a.issueDate;
      var db = b.returnDate || b.issueDate;
      return db < da ? -1 : db > da ? 1 : 0;
    }).slice(0, 8);
    var tbody = $("recent-activity");
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No activity yet.</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(function (it) {
      var book = bookById(it.bookId);
      var student = studentById(it.studentId);
      var type = it.returnDate ? "Return" : "Issue";
      var date = it.returnDate || it.issueDate;
      var status;
      if (it.returnDate) {
        status = it.fine > 0 ? (it.finePaid ? '<span class="badge ok">Fine Paid</span>' : '<span class="badge warn">Fine Due</span>') : '<span class="badge ok">Returned</span>';
      } else {
        status = it.dueDate < today ? '<span class="badge danger">Overdue</span>' : '<span class="badge ok">Active</span>';
      }
      return "<tr><td>" + type + "</td><td>" + escapeHtml(book ? book.title : "Unknown") +
        "</td><td>" + escapeHtml(student ? student.name : "Unknown") +
        "</td><td>" + escapeHtml(date) + "</td><td>" + status + "</td></tr>";
    }).join("");
  }

  function renderBooks(filter) {
    var q = (filter || "").toLowerCase();
    var rows = state.books.filter(function (b) {
      if (!q) return true;
      return (b.title + " " + b.author + " " + b.isbn + " " + (b.category || "")).toLowerCase().indexOf(q) !== -1;
    });
    var tbody = $("books-table");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No books found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (b) {
      var avail = availableCopies(b.id);
      return "<tr><td>" + escapeHtml(b.title) + "</td><td>" + escapeHtml(b.author) +
        "</td><td>" + escapeHtml(b.isbn) + "</td><td>" + escapeHtml(b.category || "-") +
        "</td><td>" + escapeHtml(b.copies) + "</td><td>" + avail +
        '</td><td><button class="btn small" data-edit-book="' + b.id + '">Edit</button> ' +
        '<button class="btn small danger" data-del-book="' + b.id + '">Delete</button></td></tr>';
    }).join("");
  }

  function renderStudents(filter) {
    var q = (filter || "").toLowerCase();
    var rows = state.students.filter(function (s) {
      if (!q) return true;
      return (s.name + " " + s.roll + " " + s.dept + " " + (s.email || "")).toLowerCase().indexOf(q) !== -1;
    });
    var tbody = $("students-table");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No students found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (s) {
      return "<tr><td>" + escapeHtml(s.name) + "</td><td>" + escapeHtml(s.roll) +
        "</td><td>" + escapeHtml(s.dept) + "</td><td>" + escapeHtml(s.email || "-") +
        "</td><td>" + escapeHtml(s.phone || "-") +
        '</td><td><button class="btn small" data-edit-student="' + s.id + '">Edit</button> ' +
        '<button class="btn small danger" data-del-student="' + s.id + '">Delete</button></td></tr>';
    }).join("");
  }

  function renderIssueControls() {
    var studentSel = $("issue-student");
    var bookSel = $("issue-book");
    studentSel.innerHTML = '<option value="">Select student</option>' + state.students.map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.name) + " (" + escapeHtml(s.roll) + ")</option>";
    }).join("");
    var available = state.books.filter(function (b) { return availableCopies(b.id) > 0; });
    bookSel.innerHTML = '<option value="">Select book</option>' + available.map(function (b) {
      return '<option value="' + b.id + '">' + escapeHtml(b.title) + " — " + availableCopies(b.id) + " available</option>";
    }).join("");
  }

  function renderActiveIssues() {
    var rows = activeIssues().sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });
    var tbody = $("active-issues-table");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No active issues.</td></tr>';
      return;
    }
    var today = todayISO();
    tbody.innerHTML = rows.map(function (it) {
      var book = bookById(it.bookId);
      var student = studentById(it.studentId);
      var due = it.dueDate < today ? '<span class="badge danger">' + escapeHtml(it.dueDate) + "</span>" : escapeHtml(it.dueDate);
      return "<tr><td>" + escapeHtml(student ? student.name : "Unknown") +
        "</td><td>" + escapeHtml(book ? book.title : "Unknown") +
        "</td><td>" + escapeHtml(it.issueDate) + "</td><td>" + due +
        '</td><td><button class="btn small primary" data-return="' + it.id + '">Return</button></td></tr>';
    }).join("");
  }

  function renderOverdue() {
    var today = todayISO();
    var rows = overdueActive(today).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });
    var tbody = $("overdue-table");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No overdue books.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (it) {
      var book = bookById(it.bookId);
      var student = studentById(it.studentId);
      var days = Math.max(0, daysBetween(it.dueDate, today));
      var fine = days * FINE_PER_DAY;
      return "<tr><td>" + escapeHtml(student ? student.name : "Unknown") +
        "</td><td>" + escapeHtml(book ? book.title : "Unknown") +
        "</td><td>" + escapeHtml(it.dueDate) + "</td><td>" + days +
        "</td><td>₹" + fine +
        '</td><td><button class="btn small primary" data-return="' + it.id + '">Return</button></td></tr>';
    }).join("");
  }

  function renderFines() {
    var rows = state.issues.filter(function (it) { return it.returnDate && Number(it.fine) > 0; })
      .sort(function (a, b) { return a.returnDate < b.returnDate ? 1 : -1; });
    var tbody = $("fines-table");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No fine records.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (it) {
      var book = bookById(it.bookId);
      var student = studentById(it.studentId);
      var status = it.finePaid ? '<span class="badge ok">Paid</span>' : '<span class="badge warn">Unpaid</span>';
      var action = it.finePaid ? "-" : '<button class="btn small" data-pay-fine="' + it.id + '">Mark Paid</button>';
      return "<tr><td>" + escapeHtml(student ? student.name : "Unknown") +
        "</td><td>" + escapeHtml(book ? book.title : "Unknown") +
        "</td><td>" + escapeHtml(it.returnDate) + "</td><td>" + escapeHtml(it.daysLate) +
        "</td><td>₹" + escapeHtml(it.fine) + "</td><td>" + status + "</td><td>" + action + "</td></tr>";
    }).join("");
  }

  function renderAll() {
    renderDashboard();
    renderBooks($("book-search").value);
    renderStudents($("student-search").value);
    renderIssueControls();
    renderActiveIssues();
    renderOverdue();
    renderFines();
  }

  function resetBookForm() {
    $("book-id").value = "";
    $("book-form").reset();
    $("book-copies").value = "1";
    $("book-submit").textContent = "Add Book";
    $("book-cancel").hidden = true;
  }

  function resetStudentForm() {
    $("student-id").value = "";
    $("student-form").reset();
    $("student-submit").textContent = "Register";
    $("student-cancel").hidden = true;
  }

  function setupBookForm() {
    $("book-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("book-id").value;
      var data = {
        title: $("book-title").value.trim(),
        author: $("book-author").value.trim(),
        isbn: $("book-isbn").value.trim(),
        category: $("book-category").value.trim(),
        copies: parseInt($("book-copies").value, 10) || 1
      };
      if (!data.title || !data.author || !data.isbn) return;
      if (data.copies < 1) { showToast("Copies must be at least 1.", true); return; }
      if (id) {
        var book = bookById(id);
        if (!book) return;
        var out = Number(book.copies) - availableCopies(id);
        if (data.copies < out) {
          showToast("Cannot reduce copies below currently issued count (" + out + ").", true);
          return;
        }
        book.title = data.title; book.author = data.author; book.isbn = data.isbn;
        book.category = data.category; book.copies = data.copies;
        showToast("Book updated.");
      } else {
        var exists = state.books.some(function (b) { return b.isbn.toLowerCase() === data.isbn.toLowerCase(); });
        if (exists) { showToast("A book with this ISBN already exists.", true); return; }
        data.id = uid();
        state.books.push(data);
        showToast("Book added.");
      }
      saveState();
      resetBookForm();
      renderAll();
    });
    $("book-cancel").addEventListener("click", resetBookForm);
    $("book-search").addEventListener("input", function () { renderBooks(this.value); });
  }

  function setupStudentForm() {
    $("student-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("student-id").value;
      var data = {
        name: $("student-name").value.trim(),
        roll: $("student-roll").value.trim(),
        dept: $("student-dept").value.trim(),
        email: $("student-email").value.trim(),
        phone: $("student-phone").value.trim()
      };
      if (!data.name || !data.roll || !data.dept) return;
      if (id) {
        var s = studentById(id);
        if (!s) return;
        s.name = data.name; s.roll = data.roll; s.dept = data.dept; s.email = data.email; s.phone = data.phone;
        showToast("Student updated.");
      } else {
        var exists = state.students.some(function (x) { return x.roll.toLowerCase() === data.roll.toLowerCase(); });
        if (exists) { showToast("Student ID already registered.", true); return; }
        data.id = uid();
        state.students.push(data);
        showToast("Student registered.");
      }
      saveState();
      resetStudentForm();
      renderAll();
    });
    $("student-cancel").addEventListener("click", resetStudentForm);
    $("student-search").addEventListener("input", function () { renderStudents(this.value); });
  }

  function setupIssueForm() {
    var issueDate = $("issue-date");
    var dueDate = $("issue-due");
    issueDate.value = todayISO();
    dueDate.value = addDays(todayISO(), DEFAULT_LOAN_DAYS);
    issueDate.addEventListener("change", function () {
      if (this.value) dueDate.value = addDays(this.value, DEFAULT_LOAN_DAYS);
    });
    $("issue-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var studentId = $("issue-student").value;
      var bookId = $("issue-book").value;
      var iDate = $("issue-date").value;
      var dDate = $("issue-due").value;
      if (!studentId || !bookId || !iDate || !dDate) { showToast("Fill all issue fields.", true); return; }
      if (dDate < iDate) { showToast("Due date cannot be before issue date.", true); return; }
      if (availableCopies(bookId) < 1) { showToast("No copies available for this book.", true); return; }
      var already = state.issues.some(function (it) {
        return !it.returnDate && it.studentId === studentId && it.bookId === bookId;
      });
      if (already) { showToast("This student already has this book issued.", true); return; }
      state.issues.push({
        id: uid(), studentId: studentId, bookId: bookId,
        issueDate: iDate, dueDate: dDate,
        returnDate: null, fine: 0, daysLate: 0, finePaid: false
      });
      saveState();
      this.reset();
      issueDate.value = todayISO();
      dueDate.value = addDays(todayISO(), DEFAULT_LOAN_DAYS);
      showToast("Book issued.");
      renderAll();
    });
  }

  function returnIssue(id) {
    for (var i = 0; i < state.issues.length; i++) {
      var it = state.issues[i];
      if (it.id !== id || it.returnDate) continue;
      var ret = todayISO();
      var late = Math.max(0, daysBetween(it.dueDate, ret));
      it.returnDate = ret;
      it.daysLate = late;
      it.fine = late * FINE_PER_DAY;
      it.finePaid = it.fine === 0;
      saveState();
      if (it.fine > 0) showToast("Book returned. Fine: ₹" + it.fine + " (" + late + " day(s) late).");
      else showToast("Book returned on time.");
      renderAll();
      return;
    }
  }

  function payFine(id) {
    for (var i = 0; i < state.issues.length; i++) {
      if (state.issues[i].id === id && state.issues[i].fine > 0) {
        state.issues[i].finePaid = true;
        saveState();
        showToast("Fine marked as paid.");
        renderAll();
        return;
      }
    }
  }

  function editBook(id) {
    var b = bookById(id);
    if (!b) return;
    $("book-id").value = b.id;
    $("book-title").value = b.title;
    $("book-author").value = b.author;
    $("book-isbn").value = b.isbn;
    $("book-category").value = b.category || "";
    $("book-copies").value = b.copies;
    $("book-submit").textContent = "Update Book";
    $("book-cancel").hidden = false;
    setView("books");
    $("book-title").focus();
  }

  function deleteBook(id) {
    var b = bookById(id);
    if (!b) return;
    var active = state.issues.some(function (it) { return it.bookId === id && !it.returnDate; });
    if (active) { showToast("Cannot delete: book has active issues.", true); return; }
    if (!window.confirm('Delete book "' + b.title + '"?')) return;
    state.books = state.books.filter(function (x) { return x.id !== id; });
    saveState();
    showToast("Book deleted.");
    renderAll();
  }

  function editStudent(id) {
    var s = studentById(id);
    if (!s) return;
    $("student-id").value = s.id;
    $("student-name").value = s.name;
    $("student-roll").value = s.roll;
    $("student-dept").value = s.dept;
    $("student-email").value = s.email || "";
    $("student-phone").value = s.phone || "";
    $("student-submit").textContent = "Update Student";
    $("student-cancel").hidden = false;
    setView("students");
    $("student-name").focus();
  }

  function deleteStudent(id) {
    var s = studentById(id);
    if (!s) return;
    var active = state.issues.some(function (it) { return it.studentId === id && !it.returnDate; });
    if (active) { showToast("Cannot delete: student has active issues.", true); return; }
    if (!window.confirm('Delete student "' + s.name + '"?')) return;
    state.students = state.students.filter(function (x) { return x.id !== id; });
    saveState();
    showToast("Student deleted.");
    renderAll();
  }

  function setupDelegation() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var editB = t.getAttribute("data-edit-book");
      var delB = t.getAttribute("data-del-book");
      var editS = t.getAttribute("data-edit-student");
      var delS = t.getAttribute("data-del-student");
      var ret = t.getAttribute("data-return");
      var pay = t.getAttribute("data-pay-fine");
      if (editB) editBook(editB);
      else if (delB) deleteBook(delB);
      else if (editS) editStudent(editS);
      else if (delS) deleteStudent(delS);
      else if (ret) returnIssue(ret);
      else if (pay) payFine(pay);
    });
  }

  function init() {
    renderNav();
    setupBookForm();
    setupStudentForm();
    setupIssueForm();
    setupDelegation();
    renderAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
